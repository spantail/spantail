import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

/**
 * SSE stream of realtime invalidation signals for the authenticated user.
 * Session-only: the browser's `EventSource` sends the cookie automatically and
 * cannot set an Authorization header, so PAT/AAT callers are not supported here.
 * The connection is routed to the caller's own UserHub; no further authorization
 * is needed because the hub only receives events addressed to this user
 * (workspace fan-out is membership-scoped at publish time).
 */
export const realtimeRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const auth = requireAuth(c);
	if (auth.via !== "session") {
		throw new AppError(
			"unauthorized",
			"Realtime streaming requires a browser session",
		);
	}
	return c.env.USER_HUB.getByName(auth.user.id).fetch(c.req.raw);
});
