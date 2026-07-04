import {
	getReportShareById,
	type ReportShareRow,
	revokeReportShare,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { toApiShare } from "../lib/share-api";
import { requireAuth, requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

/**
 * Creator-only: a share is managed by whoever minted it — the report owner or
 * a delivery recipient. Existence is not revealed to anyone else.
 */
async function requireShareOwner(
	c: Context<AppEnv>,
	id: string,
): Promise<ReportShareRow> {
	const { user } = requireAuth(c);
	const share = await getReportShareById(c.var.db, id);
	if (!share || share.createdByUserId !== user.id) {
		throw new AppError("not_found", "Share not found");
	}
	return share;
}

export const reportShareRoutes = new Hono<AppEnv>()
	// Revocation only reduces exposure, so unlike share creation it stays
	// creator-only with no workspace membership re-check. Idempotent:
	// re-revoking keeps the first timestamp. The revokedAt check in
	// loadUsableShare is what stops a revoked link from serving its content.
	.post("/:id/revoke", async (c) => {
		requireScope(c, "write");
		const share = await requireShareOwner(c, c.req.param("id"));
		const revoked = await revokeReportShare(c.var.db, share.id);
		if (!revoked) throw new AppError("internal", "Share disappeared");
		return c.json(toApiShare(revoked));
	});
