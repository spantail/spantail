import {
	createAgentInputSchema,
	generateAat,
	hashToken,
	updateAgentInputSchema,
} from "@spantail/core";
import {
	type AgentRow,
	archiveAgent,
	createAgentWithToken,
	getAgentById,
	listAgentsWithTokenForUser,
	rotateAgentToken,
	setAgentDisabled,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireInstanceAdmin } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAgentsFeature } from "../middleware/agents-feature";
import { requireSession } from "../middleware/auth";
import type { AppEnv } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Loads an active agent owned by the current session user, or 404s. */
async function requireOwnedAgent(
	c: Context<AppEnv>,
	id: string,
): Promise<AgentRow> {
	const { user } = requireSession(c);
	const agent = await getAgentById(c.var.db, id);
	if (!agent || agent.userId !== user.id || agent.archivedAt) {
		throw new AppError("not_found", "Agent not found");
	}
	return agent;
}

export const agentRoutes = new Hono<AppEnv>()
	.use(requireAgentsFeature)
	// Own list is session-only (agent management is an interactive surface). The
	// admin read is addressed by ?ownerUserId (instance admin reads a user's
	// agents, R) and goes through the scope guard so it is PAT/MCP-reachable.
	// userId/tokenHash are never returned (token summary only).
	.get("/", async (c) => {
		const ownerUserId = c.req.query("ownerUserId");
		if (ownerUserId) {
			requireInstanceAdmin(c);
			const rows = await listAgentsWithTokenForUser(c.var.db, ownerUserId);
			return c.json(rows.map(({ userId: _userId, ...rest }) => rest));
		}
		const { user } = requireSession(c);
		const rows = await listAgentsWithTokenForUser(c.var.db, user.id);
		return c.json(rows.map(({ userId: _userId, ...rest }) => rest));
	})
	// Registering an agent also issues its single access token (1:1). No
	// workspace is involved: where a session lands is named by each ingest
	// payload, and membership is checked there. The plaintext secret is
	// returned exactly once.
	.post("/", async (c) => {
		const { user } = requireSession(c);
		const input = validate(createAgentInputSchema, await c.req.json());

		const secret = generateAat();
		const { agent, token } = await createAgentWithToken(c.var.db, {
			userId: user.id,
			type: input.type,
			name: input.name,
			tokenName: input.name,
			tokenHash: await hashToken(secret),
			expiresAt: input.expiresInDays
				? new Date(Date.now() + input.expiresInDays * DAY_MS)
				: null,
		});
		const { userId: _userId, ...agentView } = agent;
		return c.json(
			{
				...agentView,
				token: {
					lastUsedAt: token.lastUsedAt,
					expiresAt: token.expiresAt,
				},
				secret,
			},
			201,
		);
	})
	.patch("/:id", async (c) => {
		const { user } = requireSession(c);
		const input = validate(updateAgentInputSchema, await c.req.json());
		const agent = await setAgentDisabled(
			c.var.db,
			user.id,
			c.req.param("id"),
			input.disabled,
		);
		if (!agent) throw new AppError("not_found", "Agent not found");
		const { userId: _userId, ...rest } = agent;
		return c.json(rest);
	})
	.delete("/:id", async (c) => {
		const { user } = requireSession(c);
		const archived = await archiveAgent(c.var.db, user.id, c.req.param("id"));
		if (!archived) throw new AppError("not_found", "Agent not found");
		return c.body(null, 204);
	})
	// Regenerates the agent's token secret in place, keeping its expiry; the
	// old secret stops working immediately. Returned once.
	.post("/:id/token/rotate", async (c) => {
		const agent = await requireOwnedAgent(c, c.req.param("id"));
		const secret = generateAat();
		const token = await rotateAgentToken(
			c.var.db,
			agent.id,
			await hashToken(secret),
		);
		if (!token) throw new AppError("not_found", "Agent access token not found");
		return c.json({ secret });
	});
