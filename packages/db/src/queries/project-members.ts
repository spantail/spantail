import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "../index";
import { user } from "../schema/auth";
import { projectMembers, projects } from "../schema/domain";

/** Members of a single project, joined with user profile for display. */
export async function listProjectMembers(db: Database, projectId: string) {
	return db
		.select({
			projectId: projectMembers.projectId,
			userId: projectMembers.userId,
			createdAt: projectMembers.createdAt,
			name: user.name,
			email: user.email,
			image: user.image,
		})
		.from(projectMembers)
		.innerJoin(user, eq(projectMembers.userId, user.id))
		.where(eq(projectMembers.projectId, projectId))
		.orderBy(projectMembers.createdAt);
}

/**
 * All project memberships across a workspace's projects in one query, for the
 * projects table's avatar stacks. Avoids a per-project round trip.
 */
export async function listMembersByProject(db: Database, workspaceId: string) {
	return db
		.select({
			projectId: projectMembers.projectId,
			userId: projectMembers.userId,
			name: user.name,
			image: user.image,
		})
		.from(projectMembers)
		.innerJoin(projects, eq(projectMembers.projectId, projects.id))
		.innerJoin(user, eq(projectMembers.userId, user.id))
		.where(eq(projects.workspaceId, workspaceId))
		.orderBy(projectMembers.createdAt);
}

export async function isProjectMember(
	db: Database,
	projectId: string,
	userId: string,
): Promise<boolean> {
	const row = await db
		.select({ userId: projectMembers.userId })
		.from(projectMembers)
		.where(
			and(
				eq(projectMembers.projectId, projectId),
				eq(projectMembers.userId, userId),
			),
		)
		.get();
	return row !== undefined;
}

/** Project ids the user belongs to within one workspace. */
export async function listProjectIdsForMember(
	db: Database,
	workspaceId: string,
	userId: string,
): Promise<string[]> {
	const rows = await db
		.select({ projectId: projectMembers.projectId })
		.from(projectMembers)
		.innerJoin(projects, eq(projectMembers.projectId, projects.id))
		.where(
			and(
				eq(projects.workspaceId, workspaceId),
				eq(projectMembers.userId, userId),
			),
		);
	return rows.map((r) => r.projectId);
}

/** Project ids the user belongs to across several workspaces (report scope). */
export async function listProjectIdsForMemberInWorkspaces(
	db: Database,
	workspaceIds: string[],
	userId: string,
): Promise<string[]> {
	if (workspaceIds.length === 0) return [];
	const rows = await db
		.select({ projectId: projectMembers.projectId })
		.from(projectMembers)
		.innerJoin(projects, eq(projectMembers.projectId, projects.id))
		.where(
			and(
				inArray(projects.workspaceId, workspaceIds),
				eq(projectMembers.userId, userId),
			),
		);
	return rows.map((r) => r.projectId);
}

export async function addProjectMember(
	db: Database,
	projectId: string,
	userId: string,
): Promise<void> {
	// Idempotent: re-adding an existing member is a no-op.
	await db
		.insert(projectMembers)
		.values({ projectId, userId })
		.onConflictDoNothing();
}

export async function removeProjectMember(
	db: Database,
	projectId: string,
	userId: string,
): Promise<void> {
	await db
		.delete(projectMembers)
		.where(
			and(
				eq(projectMembers.projectId, projectId),
				eq(projectMembers.userId, userId),
			),
		);
}

/**
 * Drops all of a user's project memberships within one workspace. Called when
 * the user is removed from the workspace, since a project member must always be
 * a workspace member.
 */
export async function removeMemberFromWorkspaceProjects(
	db: Database,
	workspaceId: string,
	userId: string,
): Promise<void> {
	await db
		.delete(projectMembers)
		.where(
			and(
				eq(projectMembers.userId, userId),
				inArray(
					projectMembers.projectId,
					db
						.select({ id: projects.id })
						.from(projects)
						.where(eq(projects.workspaceId, workspaceId)),
				),
			),
		);
}
