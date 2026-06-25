import { eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * What a caller may read among project-scoped entries (work or agent). Resolved
 * once per request from the caller's workspace role + project memberships, then
 * folded into the entry query as an extra condition. See `docs/permissions.md`.
 */
export interface EntryAccessScope {
	/** Workspaces where the caller is admin/owner: full read, no project filter. */
	adminWorkspaceIds: string[];
	/** Projects the caller belongs to: their entries are readable. */
	memberProjectIds: string[];
	/** The caller always reads their own entries (work: userId, agent: ownerUserId). */
	selfUserId: string;
}

/**
 * Builds the read predicate for project-scoped entries. An entry is readable
 * when it sits in an admin workspace, has no project (workspace-scoped — the
 * caller is already a verified workspace member), belongs to a project the
 * caller is a member of, or was authored by the caller.
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
	return or(
		access.adminWorkspaceIds.length
			? inArray(columns.workspaceId, access.adminWorkspaceIds)
			: undefined,
		options.unassignedWorkspaceWide ? isNull(columns.projectId) : undefined,
		access.memberProjectIds.length
			? inArray(columns.projectId, access.memberProjectIds)
			: undefined,
		eq(columns.self, access.selfUserId),
	);
}
