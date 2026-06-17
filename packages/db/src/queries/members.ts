import { and, eq, inArray, ne } from "drizzle-orm";

import type { Database } from "../index";
import { user } from "../schema/auth";
import { workspaceMembers } from "../schema/domain";

/**
 * Distinct users who are members of any of the given workspaces, excluding one
 * user (the sender). Used to scope the "Send to" recipient picker to people
 * entitled to the report's data (the union of its workspaces' members).
 */
export async function listDistinctMembersForWorkspaces(
	db: Database,
	workspaceIds: string[],
	excludeUserId: string,
) {
	if (workspaceIds.length === 0) return [];
	return db
		.selectDistinct({
			id: user.id,
			name: user.name,
			email: user.email,
		})
		.from(workspaceMembers)
		.innerJoin(user, eq(workspaceMembers.userId, user.id))
		.where(
			and(
				inArray(workspaceMembers.workspaceId, workspaceIds),
				ne(user.id, excludeUserId),
			),
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
		})
		.from(workspaceMembers)
		.innerJoin(user, eq(workspaceMembers.userId, user.id))
		.where(eq(workspaceMembers.workspaceId, workspaceId))
		.orderBy(workspaceMembers.createdAt);
	return rows;
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
