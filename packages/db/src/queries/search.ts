import { and, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import type { Database } from "../index";
import { workEntries } from "../schema/domain";
import { reports } from "../schema/reports";
import { type EntryAccessScope, entryAccessCondition } from "./entry-access";
import type { WorkEntryRow } from "./work-entries";

/** Per-type result cap — a top-bar palette shows a short list, not a full page. */
const SEARCH_LIMIT = 8;

/**
 * Builds a case-insensitive substring LIKE pattern. The term's LIKE wildcards
 * (`%` `_`) and the escape char (`\`) are escaped so user input matches
 * literally (no wildcard injection); callers must pair this with `escape '\'`.
 * Lowercased here so the column side only needs `lower(...)`. CJK substrings
 * match byte-wise, which is what we want for Japanese.
 */
function likePattern(term: string): string {
	const escaped = term.replace(/[\\%_]/g, (m) => `\\${m}`);
	return `%${escaped.toLowerCase()}%`;
}

/** Case-insensitive LIKE against a text column, NULL-safe, with escaping. */
function textMatch(column: AnySQLiteColumn, pattern: string): SQL {
	return sql`(${column} is not null and lower(${column}) like ${pattern} escape '\\')`;
}

/**
 * Work entries matching `term` in description, note, or any tag, restricted to
 * the caller's visible workspaces and refined by the project ACL (same predicate
 * as the entry list). The outer workspace bound is required: the ACL's
 * "unassigned entries are workspace-wide" branch is otherwise unscoped and would
 * leak unassigned entries from workspaces the caller cannot see.
 */
export async function searchWorkEntries(
	db: Database,
	params: {
		term: string;
		workspaceIds: string[];
		access: EntryAccessScope;
	},
): Promise<WorkEntryRow[]> {
	if (params.workspaceIds.length === 0) return [];
	const pattern = likePattern(params.term);
	const matches = or(
		textMatch(workEntries.description, pattern),
		textMatch(workEntries.note, pattern),
		sql`exists (select 1 from json_each(${workEntries.tags}) where lower(value) like ${pattern} escape '\\')`,
	);
	const conditions: SQL[] = [
		inArray(workEntries.workspaceId, params.workspaceIds),
	];
	if (matches) conditions.push(matches);
	const acl = entryAccessCondition(
		{
			workspaceId: workEntries.workspaceId,
			projectId: workEntries.projectId,
			self: workEntries.userId,
		},
		params.access,
		{ unassignedWorkspaceWide: true },
	);
	if (acl) conditions.push(acl);

	return db
		.select()
		.from(workEntries)
		.where(and(...conditions))
		.orderBy(desc(workEntries.entryDate), desc(workEntries.createdAt))
		.limit(SEARCH_LIMIT);
}

/**
 * Reports matching `term` in name or note, scoped to the caller's own reports
 * (reports are owner-private by default; broader admin visibility is not exposed
 * through top-bar search).
 */
export async function searchReports(
	db: Database,
	params: { term: string; ownerUserId: string },
): Promise<Array<{ id: string; name: string }>> {
	const pattern = likePattern(params.term);
	const matches = or(
		textMatch(reports.name, pattern),
		textMatch(reports.note, pattern),
	);
	const conditions: SQL[] = [eq(reports.ownerUserId, params.ownerUserId)];
	if (matches) conditions.push(matches);

	return db
		.select({ id: reports.id, name: reports.name })
		.from(reports)
		.where(and(...conditions))
		.orderBy(desc(reports.createdAt), desc(reports.id))
		.limit(SEARCH_LIMIT);
}
