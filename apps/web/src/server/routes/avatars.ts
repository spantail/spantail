import { Hono } from "hono";

import { avatarObjectKey } from "../lib/avatar";
import { AppError } from "../lib/errors";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

// Streams a user's uploaded avatar from R2. Any authenticated caller may read
// any avatar — they only ever see users they share a workspace/report with, and
// avatars are not sensitive. The cache-busting `?v=` token changes on each
// upload, so a long private cache is safe.
export const avatarRoutes = new Hono<AppEnv>().get("/:userId", async (c) => {
	requireScope(c, "read");
	const object = await c.env.UPLOADS.get(
		avatarObjectKey(c.req.param("userId")),
	);
	if (!object) throw new AppError("not_found", "Avatar not found");
	return new Response(object.body, {
		headers: {
			"Content-Type":
				object.httpMetadata?.contentType ?? "application/octet-stream",
			"Cache-Control": "private, max-age=86400",
			"X-Content-Type-Options": "nosniff",
			ETag: object.httpEtag,
		},
	});
});
