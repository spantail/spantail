import {
	AAT_PREFIX,
	hashPat,
	hashToken,
	isAatFormat,
	isPatFormat,
	PAT_PREFIX,
	type TokenScope,
} from "@toxil/core";
import {
	findAgentTokenByHash,
	findApiTokenByHash,
	getAgentById,
	getUserById,
	touchAgentToken,
	touchApiToken,
} from "@toxil/db";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { createAuth } from "../auth";
import { AppError } from "../lib/errors";
import type {
	AgentAuthContext,
	AppEnv,
	AuthContext,
	UserAuthContext,
} from "../types";

const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Resolves the caller into c.var.auth: a Bearer PAT when the Authorization
 * header is present (invalid tokens fail with 401), otherwise the Better Auth
 * session cookie, otherwise anonymous.
 */
export const loadAuth = createMiddleware<AppEnv>(async (c, next) => {
	const header = c.req.header("authorization");
	if (header?.startsWith("Bearer ")) {
		const token = header.slice("Bearer ".length);
		c.set(
			"auth",
			token.startsWith(AAT_PREFIX)
				? await resolveAat(c, token)
				: await resolvePat(c, token),
		);
		await next();
		return;
	}

	const auth = createAuth(c.env, c.var.db);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	// A disabled account is locked out immediately: ignore its still-valid
	// session so every authenticated route sees an anonymous caller (401).
	if (session && !session.user.disabled) {
		const { id, name, email, isAdmin, canManageTemplates } = session.user;
		c.set("auth", {
			user: {
				id,
				name,
				email,
				isAdmin: isAdmin ?? false,
				canManageTemplates: canManageTemplates ?? false,
			},
			via: "session",
		});
	}
	await next();
});

async function resolvePat(
	c: Context<AppEnv>,
	token: string,
): Promise<AuthContext> {
	if (!token.startsWith(PAT_PREFIX) || !isPatFormat(token)) {
		throw new AppError("unauthorized", "Invalid API token");
	}
	const row = await findApiTokenByHash(c.var.db, await hashPat(token));
	if (!row) throw new AppError("unauthorized", "Invalid API token");
	if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
		throw new AppError("unauthorized", "API token has expired");
	}
	const user = await getUserById(c.var.db, row.userId);
	if (!user) throw new AppError("unauthorized", "Invalid API token");
	// Disabled accounts are locked out immediately, including their API tokens.
	if (user.disabled)
		throw new AppError("unauthorized", "This account is disabled");

	const lastUsed = row.lastUsedAt?.getTime() ?? 0;
	if (Date.now() - lastUsed > LAST_USED_THROTTLE_MS) {
		c.executionCtx.waitUntil(touchApiToken(c.var.db, row.id));
	}

	return {
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			isAdmin: user.isAdmin ?? false,
			canManageTemplates: user.canManageTemplates ?? false,
		},
		via: "pat",
		scopes: row.scopes,
	};
}

/**
 * Resolves an agent access token (AAT) into a delegated, write-only context.
 * The agent acts for its owner, so the owner must still be a live, enabled
 * account; per-workspace membership is re-checked at ingest time.
 */
async function resolveAat(
	c: Context<AppEnv>,
	token: string,
): Promise<AuthContext> {
	if (!isAatFormat(token)) {
		throw new AppError("unauthorized", "Invalid agent access token");
	}
	const row = await findAgentTokenByHash(c.var.db, await hashToken(token));
	if (!row) throw new AppError("unauthorized", "Invalid agent access token");
	if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
		throw new AppError("unauthorized", "Agent access token has expired");
	}
	const agent = await getAgentById(c.var.db, row.agentId);
	// An archived agent's tokens are dead (the agent can't be un-archived).
	if (!agent || agent.archivedAt) {
		throw new AppError("unauthorized", "Invalid agent access token");
	}
	// A disabled agent is paused: its token is rejected until it is re-enabled.
	if (agent.disabledAt) {
		throw new AppError("unauthorized", "This agent is disabled");
	}
	const owner = await getUserById(c.var.db, agent.userId);
	if (!owner) throw new AppError("unauthorized", "Invalid agent access token");
	if (owner.disabled) {
		throw new AppError("unauthorized", "This account is disabled");
	}

	const lastUsed = row.lastUsedAt?.getTime() ?? 0;
	if (Date.now() - lastUsed > LAST_USED_THROTTLE_MS) {
		c.executionCtx.waitUntil(touchAgentToken(c.var.db, row.id));
	}

	return {
		via: "agent",
		agentId: agent.id,
		ownerUserId: owner.id,
		defaultWorkspaceId: row.defaultWorkspaceId,
	};
}

/**
 * Returns the authenticated user context or throws a structured 401. Agent
 * tokens are rejected here: they may only ingest via requireAgentAuth, never
 * act as a user on session/PAT routes.
 */
export function requireAuth(c: Context<AppEnv>): UserAuthContext {
	const auth = c.var.auth;
	if (!auth) throw new AppError("unauthorized", "Authentication required");
	if (auth.via === "agent") {
		throw new AppError(
			"forbidden",
			"Agent tokens can only ingest agent entries",
		);
	}
	return auth;
}

/**
 * Like requireAuth, but PAT callers must also hold the given scope.
 * Sessions are not scope-restricted.
 */
export function requireScope(
	c: Context<AppEnv>,
	scope: TokenScope,
): UserAuthContext {
	const auth = requireAuth(c);
	if (auth.via === "pat" && !auth.scopes.includes(scope)) {
		throw new AppError(
			"insufficient_scope",
			`This operation requires the "${scope}" scope`,
		);
	}
	return auth;
}

/** Requires a valid agent access token (the ingest-only credential). */
export function requireAgentAuth(c: Context<AppEnv>): AgentAuthContext {
	const auth = c.var.auth;
	if (auth?.via !== "agent") {
		throw new AppError("unauthorized", "Agent access token required");
	}
	return auth;
}

/** Restricts an endpoint to interactive sessions (token management). */
export function requireSession(c: Context<AppEnv>): UserAuthContext {
	const auth = requireAuth(c);
	if (auth.via !== "session") {
		throw new AppError("forbidden", "API tokens cannot manage API tokens");
	}
	return auth;
}
