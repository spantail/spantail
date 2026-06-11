import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";

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

export async function listWorkEntries(
	db: Database,
	query: {
		workspaceId: string;
		projectId?: string;
		userId?: string;
		from?: string;
		to?: string;
		limit: number;
		offset: number;
	},
): Promise<WorkEntryRow[]> {
	const conditions = [eq(workEntries.workspaceId, query.workspaceId)];
	if (query.projectId)
		conditions.push(eq(workEntries.projectId, query.projectId));
	if (query.userId) conditions.push(eq(workEntries.userId, query.userId));
	if (query.from) conditions.push(gte(workEntries.entryDate, query.from));
	if (query.to) conditions.push(lte(workEntries.entryDate, query.to));

	return db
		.select()
		.from(workEntries)
		.where(and(...conditions))
		.orderBy(desc(workEntries.entryDate), desc(workEntries.createdAt))
		.limit(query.limit)
		.offset(query.offset);
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
