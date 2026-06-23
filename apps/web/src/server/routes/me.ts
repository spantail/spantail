import { listWorkspacesForUser, updateUser } from "@toxil/db";
import { Hono } from "hono";

import {
	ALLOWED_AVATAR_TYPES,
	avatarObjectKey,
	MAX_AVATAR_BYTES,
	newAvatarToken,
	readBodyWithLimit,
	resolveAvatarUrl,
} from "../lib/avatar";
import { AppError } from "../lib/errors";
import { requireScope, requireSession } from "../middleware/auth";
import type { AppEnv } from "../types";

export const meRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const { user } = requireScope(c, "read");
		const memberships = await listWorkspacesForUser(c.var.db, user.id);
		return c.json({ user, memberships });
	})
	// Upload (replace) the caller's avatar. Interactive sessions only — avatars
	// are a profile concern, not an API-token operation.
	.post("/avatar", async (c) => {
		const { user } = requireSession(c);
		const contentType = c.req.header("content-type")?.split(";")[0]?.trim();
		if (!contentType || !ALLOWED_AVATAR_TYPES.has(contentType)) {
			throw new AppError(
				"bad_request",
				"Avatar must be a PNG, JPEG, WebP, or GIF image",
			);
		}
		// Stream the body with a hard cap so an oversized upload — even a chunked
		// one with no Content-Length — never fully buffers into Worker memory.
		const body = await readBodyWithLimit(c.req.raw.body, MAX_AVATAR_BYTES);
		if (body === null) {
			throw new AppError("bad_request", "Avatar image is too large");
		}
		if (body.byteLength === 0) {
			throw new AppError("bad_request", "Avatar image is empty");
		}
		await c.env.UPLOADS.put(avatarObjectKey(user.id), body, {
			httpMetadata: { contentType },
		});
		const token = newAvatarToken();
		await updateUser(c.var.db, user.id, { image: token });
		const memberships = await listWorkspacesForUser(c.var.db, user.id);
		return c.json({
			user: { ...user, imageUrl: resolveAvatarUrl(user.id, token) },
			memberships,
		});
	})
	// Remove the caller's avatar (falls back to initials everywhere).
	.delete("/avatar", async (c) => {
		const { user } = requireSession(c);
		await c.env.UPLOADS.delete(avatarObjectKey(user.id));
		await updateUser(c.var.db, user.id, { image: null });
		const memberships = await listWorkspacesForUser(c.var.db, user.id);
		return c.json({ user: { ...user, imageUrl: null }, memberships });
	});
