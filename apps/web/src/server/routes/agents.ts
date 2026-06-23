import {
	createAgentInputSchema,
	createAgentTokenInputSchema,
	generateAat,
	hashToken,
} from "@toxil/core";
import {
	type AgentRow,
	archiveAgent,
	createAgent,
	createAgentToken,
	deleteAgentToken,
	getAgentById,
	getProjectById,
	listAgentsForUser,
	listAgentTokensForAgent,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
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
	.get("/", async (c) => {
		const { user } = requireSession(c);
		const rows = await listAgentsForUser(c.var.db, user.id);
		return c.json(rows.map(({ userId: _userId, ...rest }) => rest));
	})
	.post("/", async (c) => {
		const { user } = requireSession(c);
		const input = validate(createAgentInputSchema, await c.req.json());
		const { userId: _userId, ...agent } = await createAgent(c.var.db, {
			userId: user.id,
			type: input.type,
			name: input.name,
		});
		return c.json(agent, 201);
	})
	.delete("/:id", async (c) => {
		const { user } = requireSession(c);
		const archived = await archiveAgent(c.var.db, user.id, c.req.param("id"));
		if (!archived) throw new AppError("not_found", "Agent not found");
		return c.body(null, 204);
	})
	.get("/:id/tokens", async (c) => {
		const agent = await requireOwnedAgent(c, c.req.param("id"));
		const tokens = await listAgentTokensForAgent(c.var.db, agent.id);
		return c.json(tokens.map(({ tokenHash: _hash, ...rest }) => rest));
	})
	.post("/:id/tokens", async (c) => {
		const agent = await requireOwnedAgent(c, c.req.param("id"));
		const input = validate(createAgentTokenInputSchema, await c.req.json());

		// A default binding must point where the issuer is a member: the agent's
		// capability can never exceed its owner's. (Re-checked live at ingest.)
		if (input.defaultProjectId && !input.defaultWorkspaceId) {
			throw new AppError(
				"bad_request",
				"A default project requires a default workspace",
			);
		}
		if (input.defaultWorkspaceId) {
			await requireWorkspaceAccess(c, input.defaultWorkspaceId);
		}
		if (input.defaultProjectId) {
			const project = await getProjectById(c.var.db, input.defaultProjectId);
			if (!project || project.workspaceId !== input.defaultWorkspaceId) {
				throw new AppError(
					"bad_request",
					"Default project does not belong to the default workspace",
				);
			}
		}

		const token = generateAat();
		const row = await createAgentToken(c.var.db, {
			agentId: agent.id,
			name: input.name,
			tokenHash: await hashToken(token),
			defaultWorkspaceId: input.defaultWorkspaceId ?? null,
			defaultProjectId: input.defaultProjectId ?? null,
			expiresAt: input.expiresInDays
				? new Date(Date.now() + input.expiresInDays * DAY_MS)
				: null,
		});
		// The plaintext token is returned exactly once.
		const { tokenHash: _hash, ...rest } = row;
		return c.json({ ...rest, token }, 201);
	})
	.delete("/:id/tokens/:tokenId", async (c) => {
		const agent = await requireOwnedAgent(c, c.req.param("id"));
		const deleted = await deleteAgentToken(
			c.var.db,
			agent.id,
			c.req.param("tokenId"),
		);
		if (!deleted)
			throw new AppError("not_found", "Agent access token not found");
		return c.body(null, 204);
	});
