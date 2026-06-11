import {
	deleteReportSnapshot,
	getReportSnapshotById,
	type ReportSnapshotRow,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";
import { requireReportOwner } from "./reports";

/** Snapshots inherit access from their parent report's owner. */
async function requireSnapshotAccess(
	c: Context<AppEnv>,
	id: string,
): Promise<ReportSnapshotRow> {
	const snapshot = await getReportSnapshotById(c.var.db, id);
	if (!snapshot) throw new AppError("not_found", "Report snapshot not found");
	await requireReportOwner(c, snapshot.reportId);
	return snapshot;
}

export const reportSnapshotRoutes = new Hono<AppEnv>()
	.get("/:id", async (c) => {
		requireScope(c, "read");
		return c.json(await requireSnapshotAccess(c, c.req.param("id")));
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const snapshot = await requireSnapshotAccess(c, c.req.param("id"));
		await deleteReportSnapshot(c.var.db, snapshot.id);
		return c.body(null, 204);
	});
