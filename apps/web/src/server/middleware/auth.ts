import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { createAuth } from "../auth";
import { AppError } from "../lib/errors";
import type { AppEnv, AuthContext } from "../types";

/** Resolves the Better Auth session (if any) into c.var.auth. */
export const loadAuth = createMiddleware<AppEnv>(async (c, next) => {
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

/** Returns the authenticated context or throws a structured 401. */
export function requireAuth(c: Context<AppEnv>): AuthContext {
	const auth = c.var.auth;
	if (!auth) throw new AppError("unauthorized", "Authentication required");
	return auth;
}
