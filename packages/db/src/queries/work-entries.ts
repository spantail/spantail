import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import type { Database } from "../index";
import { workEntries } from "../schema/domain";

export type WorkEntryRow = typeof workEntries.$inferSelect;
export type WorkEntryInsert = Omit<
	typeof workEntries.$inferInsert,
	"id" | "createdAt" | "updatedAt"
>;
export type WorkEntryPatch = Partial<
	Pick<
		WorkEntryRow,
		| "projectId"
		| "entryDate"
		| "durationMinutes"
		| "startedAt"
		| "endedAt"
		| "description"
		| "note"
		| "tags"
	>
>;

export async function createWorkEntry(
	db: Database,
	values: WorkEntryInsert,
): Promise<WorkEntryRow> {
	const rows = await db
		.insert(workEntries)
		.values({ id: crypto.randomUUID(), ...values })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("work entry insert returned no row");
	return row;
}

export async function getWorkEntryById(
	db: Database,
	id: string,
): Promise<WorkEntryRow | undefined> {
	return db.select().from(workEntries).where(eq(workEntries.id, id)).get();
}

interface WorkEntryFilter {
	workspaceId: string;
	projectId?: string;
	userId?: string;
	tag?: string;
	from?: string;
	to?: string;
}

function workEntryConditions(query: WorkEntryFilter) {
	const conditions = [eq(workEntries.workspaceId, query.workspaceId)];
	if (query.projectId)
		conditions.push(eq(workEntries.projectId, query.projectId));
	if (query.userId) conditions.push(eq(workEntries.userId, query.userId));
	// tags is a JSON array column; match a single tag via json_each.
	if (query.tag)
		conditions.push(
			sql`exists (select 1 from json_each(${workEntries.tags}) where value = ${query.tag})`,
		);
	if (query.from) conditions.push(gte(workEntries.entryDate, query.from));
	if (query.to) conditions.push(lte(workEntries.entryDate, query.to));
	return conditions;
}

export async function listWorkEntries(
	db: Database,
	query: WorkEntryFilter & {
		limit: number;
		offset: number;
	},
): Promise<WorkEntryRow[]> {
	const conditions = workEntryConditions(query);

	return db
		.select()
		.from(workEntries)
		.where(and(...conditions))
		.orderBy(desc(workEntries.entryDate), desc(workEntries.createdAt))
		.limit(query.limit)
		.offset(query.offset);
}

export interface WorkEntryStatsResult {
	totalMinutes: number;
	entryCount: number;
	byDate: Array<{ date: string; minutes: number; count: number }>;
	byProject: Array<{ projectId: string; minutes: number; count: number }>;
	byUser: Array<{ userId: string; minutes: number; count: number }>;
}

/** Aggregates entries matching the same filters as `listWorkEntries`. */
export async function getWorkEntryStats(
	db: Database,
	query: WorkEntryFilter,
): Promise<WorkEntryStatsResult> {
	const conditions = workEntryConditions(query);
	const minutes = sql<number>`sum(${workEntries.durationMinutes})`.mapWith(
		Number,
	);
	const count = sql<number>`count(*)`.mapWith(Number);

	const [byDate, byProject, byUser] = await Promise.all([
		db
			.select({ date: workEntries.entryDate, minutes, count })
			.from(workEntries)
			.where(and(...conditions))
			.groupBy(workEntries.entryDate)
			.orderBy(asc(workEntries.entryDate)),
		db
			.select({ projectId: workEntries.projectId, minutes, count })
			.from(workEntries)
			.where(and(...conditions))
			.groupBy(workEntries.projectId)
			.orderBy(desc(minutes)),
		db
			.select({ userId: workEntries.userId, minutes, count })
			.from(workEntries)
			.where(and(...conditions))
			.groupBy(workEntries.userId)
			.orderBy(desc(minutes)),
	]);

	return {
		totalMinutes: byDate.reduce((acc, row) => acc + row.minutes, 0),
		entryCount: byDate.reduce((acc, row) => acc + row.count, 0),
		byDate,
		byProject,
		byUser,
	};
}

/**
 * Distinct tags used by entries in scope (workspace, optionally a project),
 * sorted. Backs the tag filter dropdown, so options are complete regardless of
 * how many entry pages the client has loaded.
 */
export async function listWorkEntryTags(
	db: Database,
	query: { workspaceId: string; projectId?: string },
): Promise<string[]> {
	const conditions = [eq(workEntries.workspaceId, query.workspaceId)];
	if (query.projectId)
		conditions.push(eq(workEntries.projectId, query.projectId));
	const rows = await db.all<{ value: string }>(sql`
		select distinct value
		from ${workEntries}, json_each(${workEntries.tags})
		where ${and(...conditions)}
		order by value
	`);
	return rows.map((row) => row.value);
}

/** Fetches entries for a resolved report scope; tags are filtered in core. */
export async function listWorkEntriesForReport(
	db: Database,
	query: {
		workspaceIds: string[];
		projectIds?: string[];
		userIds?: string[];
		from: string;
		to: string;
	},
): Promise<WorkEntryRow[]> {
	const conditions = [
		inArray(workEntries.workspaceId, query.workspaceIds),
		gte(workEntries.entryDate, query.from),
		lte(workEntries.entryDate, query.to),
	];
	if (query.projectIds?.length)
		conditions.push(inArray(workEntries.projectId, query.projectIds));
	if (query.userIds?.length)
		conditions.push(inArray(workEntries.userId, query.userIds));

	return db
		.select()
		.from(workEntries)
		.where(and(...conditions))
		.orderBy(asc(workEntries.entryDate), asc(workEntries.createdAt));
}

export async function updateWorkEntry(
	db: Database,
	id: string,
	patch: WorkEntryPatch,
): Promise<WorkEntryRow | undefined> {
	const rows = await db
		.update(workEntries)
		.set(patch)
		.where(eq(workEntries.id, id))
		.returning();
	return rows[0];
}

export async function deleteWorkEntry(db: Database, id: string): Promise<void> {
	await db.delete(workEntries).where(eq(workEntries.id, id));
}
