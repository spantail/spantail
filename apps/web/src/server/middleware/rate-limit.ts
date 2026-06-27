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
 * The key is the token identity for agent/PAT credentials (so one leaked token
 * can't throttle a principal's other tokens) and the user for cookie sessions
 * (which carry no token id). An unauthenticated request carries no credential
 * to key on, so it is skipped here (no shared anonymous bucket) and left to the
 * downstream auth check, which answers the correct 401/403 rather than a masked
 * 429. The `INGEST_RATE_LIMITER` binding is local-only simulated, so this is
 * enforced identically in tests and in production.
 */
export const ingestRateLimit = createMiddleware<AppEnv>(async (c, next) => {
	const auth = c.var.auth;
	// No credential: don't consume a shared anonymous bucket (which would mask
	// the real 401/403 as a 429). These routes require auth, so let the
	// downstream auth check produce the correct status.
	if (!auth) {
		await next();
		return;
	}
	const key =
		auth.via === "agent"
			? `aat:${auth.tokenId}`
			: auth.via === "pat"
				? `pat:${auth.tokenId}`
				: `user:${auth.user.id}`;

	const { success } = await c.env.INGEST_RATE_LIMITER.limit({ key });
	if (!success) {
		throw new AppError(
			"rate_limited",
			"Too many ingestion requests; slow down and retry shortly",
		);
	}
	await next();
});
