import { hashPat, isPatFormat, PAT_PREFIX, type TokenScope } from "@toxil/core";
import { findApiTokenByHash, getUserById, touchApiToken } from "@toxil/db";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { createAuth } from "../auth";
import { AppError } from "../lib/errors";
import type { AppEnv, AuthContext } from "../types";

const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Resolves the caller into c.var.auth: a Bearer PAT when the Authorization
 * header is present (invalid tokens fail with 401), otherwise the Better Auth
 * session cookie, otherwise anonymous.
 */
export const loadAuth = createMiddleware<AppEnv>(async (c, next) => {
	const header = c.req.header("authorization");
	if (header?.startsWith("Bearer ")) {
		c.set("auth", await resolvePat(c, header.slice("Bearer ".length)));
		await next();
		return;
	}

	const auth = createAuth(c.env, c.var.db);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (session) {
		const { id, name, email, isAdmin } = session.user;
		c.set("auth", {
			user: { id, name, email, isAdmin: isAdmin ?? false },
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
		},
		via: "pat",
		scopes: row.scopes,
	};
}

/** Returns the authenticated context or throws a structured 401. */
export function requireAuth(c: Context<AppEnv>): AuthContext {
	const auth = c.var.auth;
	if (!auth) throw new AppError("unauthorized", "Authentication required");
	return auth;
}

/**
 * Like requireAuth, but PAT callers must also hold the given scope.
 * Sessions are not scope-restricted.
 */
export function requireScope(
	c: Context<AppEnv>,
	scope: TokenScope,
): AuthContext {
	const auth = requireAuth(c);
	if (auth.via === "pat" && !auth.scopes.includes(scope)) {
		throw new AppError(
			"insufficient_scope",
			`This operation requires the "${scope}" scope`,
		);
	}
	return auth;
}

/** Restricts an endpoint to interactive sessions (token management). */
export function requireSession(c: Context<AppEnv>): AuthContext {
	const auth = requireAuth(c);
	if (auth.via !== "session") {
		throw new AppError("forbidden", "API tokens cannot manage API tokens");
	}
	return auth;
}
