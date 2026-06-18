import { and, count, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../index";
import { projects } from "../schema/domain";
import { reports } from "../schema/reports";

export type ReportRow = typeof reports.$inferSelect;
/** A report without its (potentially large) rendered body, for list payloads. */
export type ReportMetaRow = Omit<ReportRow, "renderedMarkdown">;
export type ReportInsert = Omit<
	typeof reports.$inferInsert,
	"id" | "createdAt" | "updatedAt"
>;
export type ReportPatch = Partial<
	Pick<
		ReportRow,
		| "name"
		| "templateId"
		| "filters"
		| "note"
		| "totalMinutes"
		| "renderedMarkdown"
	>
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

export interface ListReportsFilter {
	templateId?: string;
	projectId?: string;
	from?: string;
	to?: string;
	// Omit limit to return the full filtered set (used for prev/next navigation).
	limit?: number;
	offset?: number;
}

/**
 * List metadata only (no rendered_markdown), newest first. Filters are applied
 * in SQL so a paginated page is always populated. `projectIds`/`workspaceIds`
 * live in the `filters` JSON, matched via json_extract / json_each (mirroring
 * the work-entries tag filter). Date strings (YYYY-MM-DD) compare chronologically.
 */
export async function listReportMetaByOwner(
	db: Database,
	ownerUserId: string,
	filter: ListReportsFilter,
): Promise<ReportMetaRow[]> {
	const conditions = [eq(reports.ownerUserId, ownerUserId)];
	if (filter.templateId)
		conditions.push(eq(reports.templateId, filter.templateId));
	// Period overlap with the report's stored absolute range.
	if (filter.from)
		conditions.push(
			sql`json_extract(${reports.filters}, '$.dateRange.to') >= ${filter.from}`,
		);
	if (filter.to)
		conditions.push(
			sql`json_extract(${reports.filters}, '$.dateRange.from') <= ${filter.to}`,
		);
	// Project filter: a report listing explicit projectIds matches when it
	// includes the project; an all-projects report (no projectIds) matches when
	// it spans the project's workspace.
	if (filter.projectId)
		conditions.push(
			sql`(
				(json_array_length(coalesce(json_extract(${reports.filters}, '$.projectIds'), '[]')) > 0
					and exists (select 1 from json_each(json_extract(${reports.filters}, '$.projectIds')) where value = ${filter.projectId}))
				or
				(json_array_length(coalesce(json_extract(${reports.filters}, '$.projectIds'), '[]')) = 0
					and exists (select 1 from json_each(json_extract(${reports.filters}, '$.workspaceIds'))
						where value = (select ${projects.workspaceId} from ${projects} where ${projects.id} = ${filter.projectId})))
			)`,
		);
	const query = db
		.select({
			id: reports.id,
			name: reports.name,
			ownerUserId: reports.ownerUserId,
			templateId: reports.templateId,
			filters: reports.filters,
			note: reports.note,
			totalMinutes: reports.totalMinutes,
			createdAt: reports.createdAt,
			updatedAt: reports.updatedAt,
		})
		.from(reports)
		.where(and(...conditions))
		// id breaks createdAt ties so offset paging is stable.
		.orderBy(desc(reports.createdAt), desc(reports.id))
		.$dynamic();
	if (filter.limit !== undefined)
		query.limit(filter.limit).offset(filter.offset ?? 0);
	return query;
}

/** Distinct template ids that own at least one of the caller's reports. */
export async function listReportTemplateIdsByOwner(
	db: Database,
	ownerUserId: string,
): Promise<string[]> {
	const rows = await db
		.selectDistinct({ templateId: reports.templateId })
		.from(reports)
		.where(eq(reports.ownerUserId, ownerUserId));
	return rows.map((r) => r.templateId);
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
