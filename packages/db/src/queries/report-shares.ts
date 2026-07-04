import { and, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";

import type { Database } from "../index";
import { reportContent } from "../schema/reports";
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

/**
 * A report's share links as minted by one user — in practice the owner's
 * report-screen list. Scoping by creator keeps links minted by delivery
 * recipients (from their inbox copies) out of the owner's view, and vice
 * versa: each party manages only the links they issued.
 */
export async function listReportSharesByReport(
	db: Database,
	reportId: string,
	createdByUserId: string,
): Promise<ReportShareRow[]> {
	return db
		.select(getTableColumns(reportShares))
		.from(reportShares)
		.innerJoin(
			reportContent,
			eq(reportContent.id, reportShares.reportContentId),
		)
		.where(
			and(
				eq(reportContent.reportId, reportId),
				eq(reportShares.createdByUserId, createdByUserId),
			),
		)
		.orderBy(desc(reportShares.createdAt));
}

/** One user's share links over one content version (the inbox-message list). */
export async function listReportSharesByContent(
	db: Database,
	reportContentId: string,
	createdByUserId: string,
): Promise<ReportShareRow[]> {
	return db
		.select()
		.from(reportShares)
		.where(
			and(
				eq(reportShares.reportContentId, reportContentId),
				eq(reportShares.createdByUserId, createdByUserId),
			),
		)
		.orderBy(desc(reportShares.createdAt));
}

/**
 * The public share view: the share row plus the body of the immutable content
 * version it references. The version can never change or be individually
 * deleted, so a published link always serves what was minted.
 */
export async function getReportShareByToken(
	db: Database,
	token: string,
): Promise<(ReportShareRow & { content: string }) | undefined> {
	const row = await db
		.select({ share: reportShares, content: reportContent.content })
		.from(reportShares)
		.innerJoin(
			reportContent,
			eq(reportContent.id, reportShares.reportContentId),
		)
		.where(eq(reportShares.token, token))
		.get();
	return row ? { ...row.share, content: row.content } : undefined;
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
