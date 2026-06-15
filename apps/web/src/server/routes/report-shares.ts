import {
	getReportShareById,
	type ReportShareRow,
	revokeReportShare,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { toApiShare } from "../lib/share-api";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";
import { requireReportOwner } from "./reports";

/** Owner-only via the parent report; existence is not revealed. */
async function requireShareOwner(
	c: Context<AppEnv>,
	id: string,
): Promise<ReportShareRow> {
	const share = await getReportShareById(c.var.db, id);
	if (!share) throw new AppError("not_found", "Share not found");
	await requireReportOwner(c, share.reportId);
	return share;
}

export const reportShareRoutes = new Hono<AppEnv>()
	// Revocation only reduces exposure, so unlike share creation and listing it
	// stays owner-only with no workspace membership re-check. Idempotent:
	// re-revoking keeps the first timestamp. The frozen R2 copy is deleted so a
	// revoked link can never serve stale content.
	.post("/:id/revoke", async (c) => {
		requireScope(c, "write");
		const share = await requireShareOwner(c, c.req.param("id"));
		const revoked = await revokeReportShare(c.var.db, share.id);
		if (!revoked) throw new AppError("internal", "Share disappeared");
		await c.env.SHARE_BUCKET.delete(share.r2Key).catch(() => {});
		return c.json(toApiShare(revoked));
	});
