import { createMiddleware } from "hono/factory";

import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

/**
 * Per-credential rate limit for the untrusted write path (ingestion).
 *
 * Ingestion is driven by long-lived, write-only Agent Access Tokens that live
 * on dev machines and CI, so token leakage is a realistic threat: one leaked
 * token could otherwise flood D1 with no backoff. We bucket by the calling
 * credential so one principal can't exhaust the operator's storage/cost while
 * leaving legitimate, separately-keyed callers unaffected.
 *
 * The key is the agent (for agent tokens), the user (for session/PAT), or the
 * client IP as a last resort for an unauthenticated request that somehow
 * reaches here. The `INGEST_RATE_LIMITER` binding is local-only simulated, so
 * this is enforced identically in tests and in production.
 */
export const ingestRateLimit = createMiddleware<AppEnv>(async (c, next) => {
	const auth = c.var.auth;
	const key =
		auth?.via === "agent"
			? `agent:${auth.agentId}`
			: auth
				? `user:${auth.user.id}`
				: `ip:${c.req.header("CF-Connecting-IP") ?? "unknown"}`;

	const { success } = await c.env.INGEST_RATE_LIMITER.limit({ key });
	if (!success) {
		throw new AppError(
			"rate_limited",
			"Too many ingestion requests; slow down and retry shortly",
		);
	}
	await next();
});
