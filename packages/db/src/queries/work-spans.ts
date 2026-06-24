import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import type { Database } from "../index";
import { workSpans } from "../schema/domain";

export type WorkSpanRow = typeof workSpans.$inferSelect;
export type WorkSpanInsert = Omit<
	typeof workSpans.$inferInsert,
	"id" | "createdAt" | "updatedAt"
>;
export type WorkSpanPatch = Partial<
	Pick<
		WorkSpanRow,
		| "projectId"
		| "spanDate"
		| "durationMinutes"
		| "startedAt"
		| "endedAt"
		| "description"
		| "note"
		| "tags"
	>
>;

export async function createWorkSpan(
	db: Database,
	values: WorkSpanInsert,
): Promise<WorkSpanRow> {
	const rows = await db
		.insert(workSpans)
		.values({ id: crypto.randomUUID(), ...values })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("work span insert returned no row");
	return row;
}

export async function getWorkSpanById(
	db: Database,
	id: string,
): Promise<WorkSpanRow | undefined> {
	return db.select().from(workSpans).where(eq(workSpans.id, id)).get();
}

interface WorkSpanFilter {
	workspaceId: string;
	projectId?: string;
	userId?: string;
	tag?: string;
	from?: string;
	to?: string;
}

function workSpanConditions(query: WorkSpanFilter) {
	const conditions = [eq(workSpans.workspaceId, query.workspaceId)];
	if (query.projectId)
		conditions.push(eq(workSpans.projectId, query.projectId));
	if (query.userId) conditions.push(eq(workSpans.userId, query.userId));
	// tags is a JSON array column; match a single tag via json_each.
	if (query.tag)
		conditions.push(
			sql`exists (select 1 from json_each(${workSpans.tags}) where value = ${query.tag})`,
		);
	if (query.from) conditions.push(gte(workSpans.spanDate, query.from));
	if (query.to) conditions.push(lte(workSpans.spanDate, query.to));
	return conditions;
}

export async function listWorkSpans(
	db: Database,
	query: WorkSpanFilter & {
		limit: number;
		offset: number;
	},
): Promise<WorkSpanRow[]> {
	const conditions = workSpanConditions(query);

	return db
		.select()
		.from(workSpans)
		.where(and(...conditions))
		.orderBy(desc(workSpans.spanDate), desc(workSpans.createdAt))
		.limit(query.limit)
		.offset(query.offset);
}

export interface WorkSpanStatsResult {
	totalMinutes: number;
	spanCount: number;
	byDate: Array<{ date: string; minutes: number; count: number }>;
	byProject: Array<{
		projectId: string | null;
		minutes: number;
		count: number;
	}>;
	byUser: Array<{ userId: string; minutes: number; count: number }>;
}

/** Aggregates spans matching the same filters as `listWorkSpans`. */
export async function getWorkSpanStats(
	db: Database,
	query: WorkSpanFilter,
): Promise<WorkSpanStatsResult> {
	const conditions = workSpanConditions(query);
	const minutes = sql<number>`sum(${workSpans.durationMinutes})`.mapWith(
		Number,
	);
	const count = sql<number>`count(*)`.mapWith(Number);

	const [byDate, byProject, byUser] = await Promise.all([
		db
			.select({ date: workSpans.spanDate, minutes, count })
			.from(workSpans)
			.where(and(...conditions))
			.groupBy(workSpans.spanDate)
			.orderBy(asc(workSpans.spanDate)),
		db
			.select({ projectId: workSpans.projectId, minutes, count })
			.from(workSpans)
			.where(and(...conditions))
			.groupBy(workSpans.projectId)
			.orderBy(desc(minutes)),
		db
			.select({ userId: workSpans.userId, minutes, count })
			.from(workSpans)
			.where(and(...conditions))
			.groupBy(workSpans.userId)
			.orderBy(desc(minutes)),
	]);

	return {
		totalMinutes: byDate.reduce((acc, row) => acc + row.minutes, 0),
		spanCount: byDate.reduce((acc, row) => acc + row.count, 0),
		byDate,
		byProject,
		byUser,
	};
}

/**
 * Distinct tags used by spans in scope (workspace, optionally a project),
 * sorted. Backs the tag filter dropdown, so options are complete regardless of
 * how many span pages the client has loaded.
 */
export async function listWorkSpanTags(
	db: Database,
	query: { workspaceId: string; projectId?: string },
): Promise<string[]> {
	const conditions = [eq(workSpans.workspaceId, query.workspaceId)];
	if (query.projectId)
		conditions.push(eq(workSpans.projectId, query.projectId));
	const rows = await db.all<{ value: string }>(sql`
		select distinct value
		from ${workSpans}, json_each(${workSpans.tags})
		where ${and(...conditions)}
		order by value
	`);
	return rows.map((row) => row.value);
}

/** Fetches spans for a resolved report scope; tags are filtered in core. */
export async function listWorkSpansForReport(
	db: Database,
	query: {
		workspaceIds: string[];
		projectIds?: string[];
		userIds?: string[];
		from: string;
		to: string;
	},
): Promise<WorkSpanRow[]> {
	const conditions = [
		inArray(workSpans.workspaceId, query.workspaceIds),
		gte(workSpans.spanDate, query.from),
		lte(workSpans.spanDate, query.to),
	];
	if (query.projectIds?.length)
		conditions.push(inArray(workSpans.projectId, query.projectIds));
	if (query.userIds?.length)
		conditions.push(inArray(workSpans.userId, query.userIds));

	return db
		.select()
		.from(workSpans)
		.where(and(...conditions))
		.orderBy(asc(workSpans.spanDate), asc(workSpans.createdAt));
}

export async function updateWorkSpan(
	db: Database,
	id: string,
	patch: WorkSpanPatch,
): Promise<WorkSpanRow | undefined> {
	const rows = await db
		.update(workSpans)
		.set(patch)
		.where(eq(workSpans.id, id))
		.returning();
	return rows[0];
}

export async function deleteWorkSpan(db: Database, id: string): Promise<void> {
	await db.delete(workSpans).where(eq(workSpans.id, id));
}
