import { createTokenInputSchema, generatePat, hashPat } from "@toxil/core";
import {
	createApiToken,
	deleteApiToken,
	listApiTokensForUser,
} from "@toxil/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { requireSession } from "../middleware/auth";
import type { AppEnv } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const tokenRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const { user } = requireSession(c);
		const tokens = await listApiTokensForUser(c.var.db, user.id);
		return c.json(
			tokens.map(({ tokenHash: _hash, userId: _user, ...rest }) => rest),
		);
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
