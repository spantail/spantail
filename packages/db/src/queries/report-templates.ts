import { and, eq } from "drizzle-orm";

import type { Database } from "../index";
import { reportTemplates } from "../schema/reports";

export type ReportTemplateRow = typeof reportTemplates.$inferSelect;
export type ReportTemplateInsert = Omit<
	typeof reportTemplates.$inferInsert,
	"id" | "createdAt" | "updatedAt"
>;
export type ReportTemplatePatch = Partial<
	Pick<
		ReportTemplateRow,
		| "name"
		| "description"
		| "body"
		| "enabled"
		| "nameTemplate"
		| "noteTemplate"
		| "defaultDateRange"
	>
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

/** Reserved id for the seeded default template (see seedDefaultReportTemplate). */
export const DEFAULT_REPORT_TEMPLATE_ID = "default";

/**
 * Seeds the instance default template idempotently. Triggered lazily when the
 * templates list is read and the instance has none. The fixed id plus
 * onConflictDoNothing makes the insert itself race-safe: two concurrent first
 * reads converge on a single default row instead of inserting duplicates.
 * A no-op once the row exists.
 */
export async function seedDefaultReportTemplate(
	db: Database,
	values: ReportTemplateInsert,
): Promise<void> {
	await db
		.insert(reportTemplates)
		.values({ id: DEFAULT_REPORT_TEMPLATE_ID, ...values })
		.onConflictDoNothing();
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

/**
 * Deletes `id` only if it is not the default. The `is_default = false` guard is
 * part of the DELETE so a concurrent setDefault that promotes this id between a
 * caller's read and the delete can't remove the new default. Returns true when a
 * row was deleted, false when it was the default (or already gone).
 */
export async function deleteReportTemplateIfNotDefault(
	db: Database,
	id: string,
): Promise<boolean> {
	const rows = await db
		.delete(reportTemplates)
		.where(
			and(eq(reportTemplates.id, id), eq(reportTemplates.isDefault, false)),
		)
		.returning({ id: reportTemplates.id });
	return rows.length > 0;
}

/**
 * Disables `id` only if it is not the default. The `is_default = false` guard is
 * part of the UPDATE so it stays correct under a concurrent setDefault that
 * promotes this id (a separate read-then-write could disable the new default).
 * Returns the updated row, or undefined when the row is the default (or absent).
 */
export async function disableReportTemplateIfNotDefault(
	db: Database,
	id: string,
): Promise<ReportTemplateRow | undefined> {
	const rows = await db
		.update(reportTemplates)
		.set({ enabled: false })
		.where(
			and(eq(reportTemplates.id, id), eq(reportTemplates.isDefault, false)),
		)
		.returning();
	return rows[0];
}

/**
 * Makes `id` the sole instance default. Clears the current default(s) first,
 * then promotes this one — only if it is still enabled, so a target disabled in
 * the request window is never promoted. Returns the new default, or undefined
 * when the target no longer qualifies (caller maps that to a 4xx).
 *
 * The clear-then-set order keeps the one-default unique index from tripping
 * mid-batch. The residual race — the target being deleted between the clear and
 * the set — would briefly leave no default; it needs two admins acting within
 * the same instant and self-corrects on the next create/seed, so it is accepted
 * rather than guarded with an interactive transaction D1 does not offer.
 */
export async function setDefaultReportTemplate(
	db: Database,
	id: string,
): Promise<ReportTemplateRow | undefined> {
	const [, rows] = await db.batch([
		db
			.update(reportTemplates)
			.set({ isDefault: false })
			.where(eq(reportTemplates.isDefault, true)),
		db
			.update(reportTemplates)
			.set({ isDefault: true })
			.where(and(eq(reportTemplates.id, id), eq(reportTemplates.enabled, true)))
			.returning(),
	]);
	return rows[0];
}
