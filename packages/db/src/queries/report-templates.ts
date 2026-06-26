import { eq } from "drizzle-orm";

import type { Database } from "../index";
import { reportTemplates } from "../schema/reports";

export type ReportTemplateRow = typeof reportTemplates.$inferSelect;
export type ReportTemplateInsert = Omit<
	typeof reportTemplates.$inferInsert,
	"id" | "createdAt" | "updatedAt"
>;
export type ReportTemplatePatch = Partial<
	Pick<ReportTemplateRow, "name" | "description" | "body" | "enabled">
>;

export async function createReportTemplate(
	db: Database,
	values: ReportTemplateInsert,
): Promise<ReportTemplateRow> {
	const rows = await db
		.insert(reportTemplates)
		.values({ id: crypto.randomUUID(), ...values })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("report template insert returned no row");
	return row;
}

export async function getReportTemplateById(
	db: Database,
	id: string,
): Promise<ReportTemplateRow | undefined> {
	return db
		.select()
		.from(reportTemplates)
		.where(eq(reportTemplates.id, id))
		.get();
}

export async function listReportTemplates(
	db: Database,
): Promise<ReportTemplateRow[]> {
	return db.select().from(reportTemplates).orderBy(reportTemplates.createdAt);
}

export async function updateReportTemplate(
	db: Database,
	id: string,
	patch: ReportTemplatePatch,
): Promise<ReportTemplateRow | undefined> {
	const rows = await db
		.update(reportTemplates)
		.set(patch)
		.where(eq(reportTemplates.id, id))
		.returning();
	return rows[0];
}

export async function deleteReportTemplate(
	db: Database,
	id: string,
): Promise<void> {
	await db.delete(reportTemplates).where(eq(reportTemplates.id, id));
}
