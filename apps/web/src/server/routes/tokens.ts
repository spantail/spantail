import { createTokenInputSchema, generatePat, hashPat } from "@spantail/core";
import {
	createApiToken,
	deleteApiToken,
	listApiTokensForUser,
} from "@spantail/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireInstanceAdmin } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireSession } from "../middleware/auth";
import type { AppEnv } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

// Strips the secret hash and owner id from a token row — only metadata leaves
// the server, for the owner and for an instance-admin read alike.
function toTokenMeta({
	tokenHash: _hash,
	userId: _user,
	...rest
}: Awaited<ReturnType<typeof listApiTokensForUser>>[number]) {
	return rest;
}

export const tokenRoutes = new Hono<AppEnv>()
	// Own list is session-only (token management is interactive). An instance
	// admin may read another user's token metadata via ?ownerUserId (matrix R —
	// metadata only; tokens have no workspace dimension, so there is no R*).
	.get("/", async (c) => {
		const ownerUserId = c.req.query("ownerUserId");
		if (ownerUserId) {
			requireInstanceAdmin(c);
			const tokens = await listApiTokensForUser(c.var.db, ownerUserId);
			return c.json(tokens.map(toTokenMeta));
		}
		const { user } = requireSession(c);
		const tokens = await listApiTokensForUser(c.var.db, user.id);
		return c.json(tokens.map(toTokenMeta));
	})
	.post("/", async (c) => {
		const { user } = requireSession(c);
		const input = validate(createTokenInputSchema, await c.req.json());

		const token = generatePat();
		const row = await createApiToken(c.var.db, {
			userId: user.id,
			name: input.name,
			tokenHash: await hashPat(token),
			scopes: input.scopes,
			expiresAt: input.expiresInDays
				? new Date(Date.now() + input.expiresInDays * DAY_MS)
				: null,
		});
		// The plaintext token is returned exactly once.
		const { tokenHash: _hash, userId: _user, ...rest } = row;
		return c.json({ ...rest, token }, 201);
	})
	.delete("/:id", async (c) => {
		const { user } = requireSession(c);
		const deleted = await deleteApiToken(c.var.db, user.id, c.req.param("id"));
		if (!deleted) throw new AppError("not_found", "API token not found");
		return c.body(null, 204);
	});
