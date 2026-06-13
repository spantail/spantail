import { desc, eq } from "drizzle-orm";

import type { Database } from "../index";
import { reportSnapshots } from "../schema/reports";

export type ReportSnapshotRow = typeof reportSnapshots.$inferSelect;
export type ReportSnapshotMetaRow = Omit<ReportSnapshotRow, "renderedMarkdown">;
export type ReportSnapshotInsert = Omit<
	typeof reportSnapshots.$inferInsert,
	"id" | "generatedAt"
>;

export async function createReportSnapshot(
	db: Database,
	values: ReportSnapshotInsert,
): Promise<ReportSnapshotRow> {
	const rows = await db
		.insert(reportSnapshots)
		.values({ id: crypto.randomUUID(), ...values })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("report snapshot insert returned no row");
	return row;
}

export async function getReportSnapshotById(
	db: Database,
	id: string,
): Promise<ReportSnapshotRow | undefined> {
	return db
		.select()
		.from(reportSnapshots)
		.where(eq(reportSnapshots.id, id))
		.get();
}

/** Lists snapshot metadata; the rendered markdown stays out of list payloads. */
export async function listReportSnapshots(
	db: Database,
	reportId: string,
): Promise<ReportSnapshotMetaRow[]> {
	return db
		.select({
			id: reportSnapshots.id,
			reportId: reportSnapshots.reportId,
			resolvedFilters: reportSnapshots.resolvedFilters,
			generatedAt: reportSnapshots.generatedAt,
		})
		.from(reportSnapshots)
		.where(eq(reportSnapshots.reportId, reportId))
		.orderBy(desc(reportSnapshots.generatedAt));
}

export async function deleteReportSnapshot(
	db: Database,
	id: string,
): Promise<void> {
	await db.delete(reportSnapshots).where(eq(reportSnapshots.id, id));
}
