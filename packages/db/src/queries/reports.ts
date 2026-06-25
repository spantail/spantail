import { and, count, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../index";
import { projects } from "../schema/domain";
import { reportContent, reports } from "../schema/reports";

/** A report header: the mutable, queryable current state (no rendered body). */
export type ReportRow = typeof reports.$inferSelect;
/** The header is body-less, so list payloads use it as-is. */
export type ReportMetaRow = ReportRow;
export type ReportContentRow = typeof reportContent.$inferSelect;
/** Header fields supplied by the caller; id/version/timestamps are set here. */
export type ReportInsert = Omit<
	typeof reports.$inferInsert,
	"id" | "version" | "createdAt" | "updatedAt"
>;
export type ReportHeaderPatch = Pick<
	typeof reports.$inferInsert,
	| "name"
	| "templateId"
	| "filters"
	| "note"
	| "totalMinutes"
	| "snapshotProjectIds"
>;

/**
 * Creates a report header (version 1) and its first immutable content version
 * atomically. D1 has no interactive transactions; batch keeps both writes in one
 * round trip. Returns the header plus the version-1 content row.
 */
export async function createReport(
	db: Database,
	values: ReportInsert & { content: string },
): Promise<{ report: ReportRow; content: ReportContentRow }> {
	const reportId = crypto.randomUUID();
	const { content, ...header } = values;
	const [reportRows, contentRows] = await db.batch([
		db
			.insert(reports)
			.values({ id: reportId, version: 1, ...header })
			.returning(),
		db
			.insert(reportContent)
			.values({
				id: crypto.randomUUID(),
				reportId,
				version: 1,
				content,
				note: header.note ?? null,
			})
			.returning(),
	]);
	const report = reportRows[0];
	const contentRow = contentRows[0];
	if (!report || !contentRow) throw new Error("report insert returned no row");
	return { report, content: contentRow };
}

export async function getReportById(
	db: Database,
	id: string,
): Promise<ReportRow | undefined> {
	return db.select().from(reports).where(eq(reports.id, id)).get();
}

/** The current (latest) content version of a report. */
export async function getCurrentReportContent(
	db: Database,
	reportId: string,
): Promise<ReportContentRow | undefined> {
	return db
		.select()
		.from(reportContent)
		.where(eq(reportContent.reportId, reportId))
		.orderBy(desc(reportContent.version))
		.limit(1)
		.get();
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
 * List headers (no content), newest first. Filters are applied in SQL so a
 * paginated page is always populated. `projectIds`/`workspaceIds` live in the
 * `filters` JSON, matched via json_extract / json_each (mirroring the
 * work-entries tag filter). Date strings (YYYY-MM-DD) compare chronologically.
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
		.select()
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

/**
 * Records an edit: bumps the header to `version` and appends a new immutable
 * content version, atomically. The caller computes `version` as the current
 * version + 1. Returns the updated header and the new content row.
 */
export async function updateReportWithNewVersion(
	db: Database,
	id: string,
	values: ReportHeaderPatch & { version: number; content: string },
): Promise<{ report: ReportRow; content: ReportContentRow } | undefined> {
	const { version, content, ...header } = values;
	const [reportRows, contentRows] = await db.batch([
		db
			.update(reports)
			.set({ ...header, version })
			.where(eq(reports.id, id))
			.returning(),
		db
			.insert(reportContent)
			.values({
				id: crypto.randomUUID(),
				reportId: id,
				version,
				content,
				note: header.note ?? null,
			})
			.returning(),
	]);
	const report = reportRows[0];
	const contentRow = contentRows[0];
	if (!report || !contentRow) return undefined;
	return { report, content: contentRow };
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
