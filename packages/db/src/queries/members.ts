import { and, eq, inArray, ne, sql } from "drizzle-orm";

import type { Database } from "../index";
import { user } from "../schema/auth";
import { workspaceMembers } from "../schema/domain";

/**
 * Users who are members of EVERY given workspace, excluding one user (the
 * sender). Used to scope the "Send to" recipient picker: a report's frozen body
 * includes entries from all of `report.filters.workspaceIds`, and reading a
 * report requires membership in every one of them (`requireScopeWorkspaces`), so
 * recipients must clear the same bar — a member of only some of the workspaces
 * would otherwise receive data they cannot access.
 */
export async function listMembersInAllWorkspaces(
	db: Database,
	workspaceIds: string[],
	excludeUserId: string,
) {
	const ids = [...new Set(workspaceIds)];
	if (ids.length === 0) return [];
	return db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
		})
		.from(workspaceMembers)
		.innerJoin(user, eq(workspaceMembers.userId, user.id))
		.where(
			and(
				inArray(workspaceMembers.workspaceId, ids),
				ne(user.id, excludeUserId),
			),
		)
		.groupBy(user.id, user.name, user.email, user.image)
		.having(
			eq(sql`count(distinct ${workspaceMembers.workspaceId})`, ids.length),
		)
		.orderBy(user.name);
}

export async function listMembers(db: Database, workspaceId: string) {
	const rows = await db
		.select({
			workspaceId: workspaceMembers.workspaceId,
			userId: workspaceMembers.userId,
			role: workspaceMembers.role,
			createdAt: workspaceMembers.createdAt,
			name: user.name,
			email: user.email,
			image: user.image,
		})
		.from(workspaceMembers)
		.innerJoin(user, eq(workspaceMembers.userId, user.id))
		.where(eq(workspaceMembers.workspaceId, workspaceId))
		.orderBy(workspaceMembers.createdAt);
	return rows;
}

/**
 * The user ids of every member of a workspace. Used to fan out realtime
 * invalidation signals to each member's UserHub after a workspace-scoped write.
 */
export async function listWorkspaceMemberIds(
	db: Database,
	workspaceId: string,
): Promise<string[]> {
	const rows = await db
		.select({ userId: workspaceMembers.userId })
		.from(workspaceMembers)
		.where(eq(workspaceMembers.workspaceId, workspaceId));
	return rows.map((r) => r.userId);
}

export async function addMember(
	db: Database,
	input: { workspaceId: string; userId: string; role: "admin" | "member" },
) {
	await db.insert(workspaceMembers).values(input);
}

/** Whether the user is the owner of any workspace. */
export async function userOwnsAnyWorkspace(
	db: Database,
	userId: string,
): Promise<boolean> {
	const row = await db
		.select({ workspaceId: workspaceMembers.workspaceId })
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.userId, userId),
				eq(workspaceMembers.role, "owner"),
			),
		)
		.get();
	return row !== undefined;
}

export async function removeMember(
	db: Database,
	workspaceId: string,
	userId: string,
) {
	await db
		.delete(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				eq(workspaceMembers.userId, userId),
			),
		);
}
