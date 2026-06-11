import {
	deleteReportSnapshot,
	getReportSnapshotById,
	type ReportSnapshotRow,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireScopeWorkspaces } from "../lib/permissions";
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
		const snapshot = await requireSnapshotAccess(c, c.req.param("id"));
		// The rendered markdown is workspace data: losing membership in any
		// scoped workspace also revokes access to the frozen snapshot content.
		// Deletion stays owner-only — removing data needs no membership.
		await requireScopeWorkspaces(c, snapshot.resolvedScope.workspaceIds);
		return c.json(snapshot);
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const snapshot = await requireSnapshotAccess(c, c.req.param("id"));
		await deleteReportSnapshot(c.var.db, snapshot.id);
		return c.body(null, 204);
	});
