import { getInstanceSettings } from "@spantail/db";
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
	// Defense in depth: the client only connects when the instance toggle is on,
	// but a stale tab may still try. EventSource gives up on a non-200 response,
	// so refusing here keeps disabled instances free of pinned hubs.
	const settings = await getInstanceSettings(c.var.db);
	if (!settings?.realtimeEnabled) {
		throw new AppError(
			"forbidden",
			"Realtime updates are disabled on this instance",
		);
	}
	return c.env.USER_HUB.getByName(auth.user.id).fetch(c.req.raw);
});
