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
	listProjectsByIds,
	rotateAgentToken,
	setAgentDisabled,
} from "@spantail/db";
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
		const rows = await listAgentsWithTokenForUser(c.var.db, user.id);
		return c.json(rows.map(({ userId: _userId, ...rest }) => rest));
	})
	// Registering an agent also issues its single access token (1:1). The default
	// workspace is required so the token always knows where to log; the optional
	// project set associates the agent with a subset of that workspace's projects
	// (empty = all). The plaintext secret is returned exactly once.
	.post("/", async (c) => {
		const { user } = requireSession(c);
		const input = validate(createAgentInputSchema, await c.req.json());

		// A binding can never exceed its owner's live membership. (Re-checked at
		// ingest.) The workspace must be one the issuer belongs to; every
		// associated project must live in that workspace.
		await requireWorkspaceAccess(c, input.defaultWorkspaceId);
		// Sort (and de-dupe) so the create response matches the order GET /agents
		// returns (agent_projects is read back ordered by project_id).
		const projectIds = [...new Set(input.projectIds ?? [])].sort();
		if (projectIds.length > 0) {
			const projects = await listProjectsByIds(c.var.db, projectIds);
			const inWorkspace = new Set(
				projects
					.filter((p) => p.workspaceId === input.defaultWorkspaceId)
					.map((p) => p.id),
			);
			if (projectIds.some((id) => !inWorkspace.has(id))) {
				throw new AppError(
					"bad_request",
					"A selected project does not exist or does not belong to the default workspace",
				);
			}
		}

		const secret = generateAat();
		const { agent, token } = await createAgentWithToken(c.var.db, {
			userId: user.id,
			type: input.type,
			name: input.name,
			tokenName: input.name,
			tokenHash: await hashToken(secret),
			defaultWorkspaceId: input.defaultWorkspaceId,
			projectIds,
			expiresAt: input.expiresInDays
				? new Date(Date.now() + input.expiresInDays * DAY_MS)
				: null,
		});
		const { userId: _userId, ...agentView } = agent;
		return c.json(
			{
				...agentView,
				token: {
					defaultWorkspaceId: token.defaultWorkspaceId,
					lastUsedAt: token.lastUsedAt,
					expiresAt: token.expiresAt,
				},
				projectIds,
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
	// Regenerates the agent's token secret in place, keeping its binding and
	// expiry; the old secret stops working immediately. Returned once.
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
