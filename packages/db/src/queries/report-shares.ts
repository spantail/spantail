import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../index";
import { reportShares } from "../schema/shares";

export type ReportShareRow = typeof reportShares.$inferSelect;
export type ReportShareInsert = Omit<
	typeof reportShares.$inferInsert,
	"id" | "createdAt" | "viewCount" | "lastViewedAt" | "revokedAt"
>;

export async function createReportShare(
	db: Database,
	values: ReportShareInsert,
): Promise<ReportShareRow> {
	const rows = await db
		.insert(reportShares)
		.values({ id: crypto.randomUUID(), ...values })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("report share insert returned no row");
	return row;
}

export async function getReportShareById(
	db: Database,
	id: string,
): Promise<ReportShareRow | undefined> {
	return db.select().from(reportShares).where(eq(reportShares.id, id)).get();
}

export async function listReportSharesByReport(
	db: Database,
	reportId: string,
): Promise<ReportShareRow[]> {
	return db
		.select()
		.from(reportShares)
		.where(eq(reportShares.reportId, reportId))
		.orderBy(desc(reportShares.createdAt));
}

/**
 * The public share view reads everything off the share row: title/period and
 * the rendered body are all frozen on it at mint, so a later report edit never
 * changes a published link.
 */
export async function getReportShareByToken(
	db: Database,
	token: string,
): Promise<ReportShareRow | undefined> {
	return db
		.select()
		.from(reportShares)
		.where(eq(reportShares.token, token))
		.get();
}

/** Idempotent: re-revoking keeps the original revocation timestamp. */
export async function revokeReportShare(
	db: Database,
	id: string,
): Promise<ReportShareRow | undefined> {
	await db
		.update(reportShares)
		.set({ revokedAt: new Date() })
		.where(and(eq(reportShares.id, id), isNull(reportShares.revokedAt)));
	return getReportShareById(db, id);
}

export async function recordShareView(db: Database, id: string): Promise<void> {
	await db
		.update(reportShares)
		.set({
			viewCount: sql`${reportShares.viewCount} + 1`,
			lastViewedAt: new Date(),
		})
		.where(eq(reportShares.id, id));
}
