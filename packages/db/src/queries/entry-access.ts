import { and, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import { projectMembers } from "../schema/domain";

/**
 * What a caller may read among project-scoped entries (work or agent). Resolved
 * once per request from the caller's workspace role; project membership itself
 * is checked in-SQL (see `entryAccessCondition`). See `docs/permissions.md`.
 */
export interface EntryAccessScope {
	/** Workspaces where the caller is admin/owner: full read, no project filter. */
	adminWorkspaceIds: string[];
	/** The caller: reads their own entries and the projects they belong to. */
	userId: string;
}

/**
 * Builds the read predicate for project-scoped entries. An entry is readable
 * when it sits in an admin workspace, has no project (workspace-scoped — the
 * caller is already a verified workspace member), belongs to a project the
 * caller is a member of, or was authored by the caller.
 *
 * Project membership is tested with a correlated `EXISTS` against
 * `project_members` rather than expanding the caller's project ids into an `IN`
 * list — a member of many projects would otherwise blow past D1's 100 bound-
 * parameter cap on every entry read.
 *
 * `unassignedWorkspaceWide` controls whether entries with no project are
 * visible to every workspace member. Work entries set it (an unassigned entry —
 * e.g. one orphaned by a project deletion — is workspace-scoped), while agent
 * entries do not (unassigned agent activity stays private to its owner). The
 * `self` branch is always present, so the result is never an empty `or`.
 */
export function entryAccessCondition(
	columns: {
		workspaceId: AnySQLiteColumn;
		projectId: AnySQLiteColumn;
		self: AnySQLiteColumn;
	},
	access: EntryAccessScope,
	options: { unassignedWorkspaceWide: boolean },
): SQL | undefined {
	const memberOfEntryProject = sql`exists (select 1 from ${projectMembers} where ${and(
		eq(projectMembers.projectId, columns.projectId),
		eq(projectMembers.userId, access.userId),
	)})`;
	return or(
		access.adminWorkspaceIds.length
			? inArray(columns.workspaceId, access.adminWorkspaceIds)
			: undefined,
		options.unassignedWorkspaceWide ? isNull(columns.projectId) : undefined,
		memberOfEntryProject,
		eq(columns.self, access.userId),
	);
}
