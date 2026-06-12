import {
	getReportShareById,
	type ReportShareRow,
	revokeReportShare,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";
import { requireSnapshotAccess, toApiShare } from "./report-snapshots";

/** Owner-only via the parent snapshot; existence is not revealed. */
async function requireShareOwner(
	c: Context<AppEnv>,
	id: string,
): Promise<ReportShareRow> {
	const share = await getReportShareById(c.var.db, id);
	if (!share) throw new AppError("not_found", "Share not found");
	await requireSnapshotAccess(c, share.snapshotId);
	return share;
}

export const reportShareRoutes = new Hono<AppEnv>()
	// Revocation only reduces exposure, so unlike share creation and listing
	// it stays owner-only with no workspace membership re-check (mirroring
	// snapshot deletion). Idempotent: re-revoking keeps the first timestamp.
	.post("/:id/revoke", async (c) => {
		requireScope(c, "write");
		const share = await requireShareOwner(c, c.req.param("id"));
		const revoked = await revokeReportShare(c.var.db, share.id);
		if (!revoked) throw new AppError("internal", "Share disappeared");
		return c.json(toApiShare(revoked));
	});
