import { Hono } from "hono";

import { requireSession } from "../middleware/auth";
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
	const { user } = requireSession(c);
	return c.env.USER_HUB.getByName(user.id).fetch(c.req.raw);
});
