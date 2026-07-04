import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import type { Database } from "../index";
import { workEntries } from "../schema/domain";
import { type EntryAccessScope, entryAccessCondition } from "./entry-access";

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

// D1 caps a query at 100 bound parameters; each work-entry row binds 12
// columns (id + 11 fields; createdAt/updatedAt use SQL defaults), so a chunk
// of 8 stays under the cap (96).
const WORK_ENTRY_INSERT_CHUNK = 8;

// The same cap applies to the ids of the ownership pre-check select.
const WORK_ENTRY_ID_SELECT_CHUNK = 100;

/** Insert row with a caller-controlled id (= externalId for idempotent import). */
export type WorkEntryBatchRow = WorkEntryInsert & { id: string };

/**
 * Existing rows for the given ids, reduced to ownership fields. Backs the
 * batch route's guard against client-supplied ids colliding with entries of
 * another user or workspace.
 */
export async function getWorkEntryOwnersByIds(
	db: Database,
	ids: string[],
): Promise<Array<Pick<WorkEntryRow, "id" | "workspaceId" | "userId">>> {
	const owners: Array<Pick<WorkEntryRow, "id" | "workspaceId" | "userId">> = [];
	for (let i = 0; i < ids.length; i += WORK_ENTRY_ID_SELECT_CHUNK) {
		owners.push(
			...(await db
				.select({
					id: workEntries.id,
					workspaceId: workEntries.workspaceId,
					userId: workEntries.userId,
				})
				.from(workEntries)
				.where(
					inArray(workEntries.id, ids.slice(i, i + WORK_ENTRY_ID_SELECT_CHUNK)),
				)),
		);
	}
	return owners;
}

/** A batch row's id conflicted with an entry of another user or workspace. */
export class WorkEntryOwnershipConflictError extends Error {
	constructor() {
		super("an externalId in the batch belongs to another user or workspace");
		this.name = "WorkEntryOwnershipConflictError";
	}
}

/**
 * Upserts all rows in one db.batch (D1's implicit transaction): any failure
 * rolls back every chunk. A caller-supplied id is the import's externalId, so
 * an id conflict means "the same imported entry, sent again" and updates the
 * row in place. Overwriting is only legal for the same user and workspace:
 * the CASE in the SET forces user_id to NULL — violating its NOT NULL
 * constraint — when a foreign row conflicts, so the statement fails and the
 * whole batch rolls back (surfaced as WorkEntryOwnershipConflictError) even
 * when the conflict raced past the route's friendlier pre-check. Callers must
 * reject duplicate ids within `rows` beforehand — SQLite errors when one
 * statement touches the same row twice.
 */
export async function createWorkEntriesBatch(
	db: Database,
	rows: WorkEntryBatchRow[],
): Promise<void> {
	const sameOwner = sql`${workEntries.userId} = excluded.user_id AND ${workEntries.workspaceId} = excluded.workspace_id`;
	const statements = [];
	for (let i = 0; i < rows.length; i += WORK_ENTRY_INSERT_CHUNK) {
		statements.push(
			db
				.insert(workEntries)
				.values(rows.slice(i, i + WORK_ENTRY_INSERT_CHUNK))
				.onConflictDoUpdate({
					target: workEntries.id,
					set: {
						userId: sql`CASE WHEN ${sameOwner} THEN excluded.user_id ELSE NULL END`,
						projectId: sql`excluded.project_id`,
						entryDate: sql`excluded.entry_date`,
						durationMinutes: sql`excluded.duration_minutes`,
						startedAt: sql`excluded.started_at`,
						endedAt: sql`excluded.ended_at`,
						description: sql`excluded.description`,
						note: sql`excluded.note`,
						tags: sql`excluded.tags`,
						source: sql`excluded.source`,
						// $onUpdate only fires on update(); the upsert path sets it
						// explicitly (and binds no parameter).
						updatedAt: sql`(cast(unixepoch('subsecond') * 1000 as integer))`,
					},
				}),
		);
	}
	const [first, ...rest] = statements;
	if (!first) return;
	try {
		await db.batch([first, ...rest]);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("NOT NULL constraint failed: work_entries.user_id")
		) {
			throw new WorkEntryOwnershipConflictError();
		}
		throw error;
	}
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
	// When set, restricts results to entries the caller may read (project ACL).
	// Omitted for trusted internal callers; route handlers always pass it.
	access?: EntryAccessScope;
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
	if (query.access) {
		const cond = entryAccessCondition(
			{
				workspaceId: workEntries.workspaceId,
				projectId: workEntries.projectId,
				self: workEntries.userId,
			},
			query.access,
			{ unassignedWorkspaceWide: true },
		);
		if (cond) conditions.push(cond);
	}
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
	byProject: Array<{
		projectId: string | null;
		minutes: number;
		count: number;
	}>;
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
	query: { workspaceId: string; projectId?: string; access?: EntryAccessScope },
): Promise<string[]> {
	const conditions = [eq(workEntries.workspaceId, query.workspaceId)];
	if (query.projectId)
		conditions.push(eq(workEntries.projectId, query.projectId));
	if (query.access) {
		const cond = entryAccessCondition(
			{
				workspaceId: workEntries.workspaceId,
				projectId: workEntries.projectId,
				self: workEntries.userId,
			},
			query.access,
			{ unassignedWorkspaceWide: true },
		);
		if (cond) conditions.push(cond);
	}
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
		access?: EntryAccessScope;
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
	if (query.access) {
		const cond = entryAccessCondition(
			{
				workspaceId: workEntries.workspaceId,
				projectId: workEntries.projectId,
				self: workEntries.userId,
			},
			query.access,
			{ unassignedWorkspaceWide: true },
		);
		if (cond) conditions.push(cond);
	}

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
