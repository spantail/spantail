import { count, eq } from "drizzle-orm";

import type { Database } from "../index";
import { reports } from "../schema/reports";

export type ReportRow = typeof reports.$inferSelect;
export type ReportInsert = Omit<
	typeof reports.$inferInsert,
	"id" | "createdAt" | "updatedAt"
>;
export type ReportPatch = Partial<
	Pick<ReportRow, "name" | "templateId" | "filters" | "note">
>;

export async function createReport(
	db: Database,
	values: ReportInsert,
): Promise<ReportRow> {
	const rows = await db
		.insert(reports)
		.values({ id: crypto.randomUUID(), ...values })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("report insert returned no row");
	return row;
}

export async function getReportById(
	db: Database,
	id: string,
): Promise<ReportRow | undefined> {
	return db.select().from(reports).where(eq(reports.id, id)).get();
}

export async function listReportsByOwner(
	db: Database,
	ownerUserId: string,
): Promise<ReportRow[]> {
	return db
		.select()
		.from(reports)
		.where(eq(reports.ownerUserId, ownerUserId))
		.orderBy(reports.createdAt);
}

export async function updateReport(
	db: Database,
	id: string,
	patch: ReportPatch,
): Promise<ReportRow | undefined> {
	const rows = await db
		.update(reports)
		.set(patch)
		.where(eq(reports.id, id))
		.returning();
	return rows[0];
}

export async function deleteReport(db: Database, id: string): Promise<void> {
	await db.delete(reports).where(eq(reports.id, id));
}

export async function countReportsByTemplateId(
	db: Database,
	templateId: string,
): Promise<number> {
	const rows = await db
		.select({ value: count() })
		.from(reports)
		.where(eq(reports.templateId, templateId));
	return rows[0]?.value ?? 0;
}
