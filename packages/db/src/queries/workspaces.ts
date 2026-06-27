import { and, eq } from "drizzle-orm";

import type { Database } from "../index";
import { workspaceMembers, workspaces } from "../schema/domain";

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type MembershipRow = typeof workspaceMembers.$inferSelect;

export async function createWorkspace(
	db: Database,
	input: { slug: string; name: string; ownerUserId: string },
): Promise<WorkspaceRow> {
	const id = crypto.randomUUID();
	// D1 has no interactive transactions; batch keeps both writes atomic.
	const [inserted] = await db.batch([
		db
			.insert(workspaces)
			.values({
				id,
				slug: input.slug,
				name: input.name,
			})
			.returning(),
		db.insert(workspaceMembers).values({
			workspaceId: id,
			userId: input.ownerUserId,
			role: "owner",
		}),
	]);
	const row = inserted[0];
	if (!row) throw new Error("workspace insert returned no row");
	return row;
}

export async function getWorkspaceById(
	db: Database,
	id: string,
): Promise<WorkspaceRow | undefined> {
	return db.select().from(workspaces).where(eq(workspaces.id, id)).get();
}

export async function getWorkspaceBySlug(
	db: Database,
	slug: string,
): Promise<WorkspaceRow | undefined> {
	return db.select().from(workspaces).where(eq(workspaces.slug, slug)).get();
}

export async function listWorkspacesForUser(
	db: Database,
	userId: string,
): Promise<Array<WorkspaceRow & { role: MembershipRow["role"] }>> {
	const rows = await db
		.select()
		.from(workspaceMembers)
		.innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
		.where(eq(workspaceMembers.userId, userId))
		.orderBy(workspaces.createdAt);
	return rows.map((row) => ({
		...row.workspaces,
		role: row.workspace_members.role,
	}));
}

/**
 * Lists every workspace for an instance admin, joined to the caller's own
 * membership so the UI can tell which ones they actually belong to. `role` is
 * the caller's role where they are a member, or `null` when they are not (an
 * admin viewing a workspace via the instance-admin bypass). Plain members use
 * `listWorkspacesForUser` instead — this is admin-only.
 */
export async function listAllWorkspaces(
	db: Database,
	userId: string,
): Promise<Array<WorkspaceRow & { role: MembershipRow["role"] | null }>> {
	const rows = await db
		.select({ workspace: workspaces, role: workspaceMembers.role })
		.from(workspaces)
		.leftJoin(
			workspaceMembers,
			and(
				eq(workspaceMembers.workspaceId, workspaces.id),
				eq(workspaceMembers.userId, userId),
			),
		)
		.orderBy(workspaces.createdAt);
	return rows.map((row) => ({ ...row.workspace, role: row.role }));
}

export async function updateWorkspace(
	db: Database,
	id: string,
	patch: Partial<
		Pick<
			WorkspaceRow,
			"slug" | "name" | "accentColor" | "archivedAt" | "settings" | "logoUrl"
		>
	>,
): Promise<WorkspaceRow | undefined> {
	const rows = await db
		.update(workspaces)
		.set(patch)
		.where(eq(workspaces.id, id))
		.returning();
	return rows[0];
}

export async function getMembership(
	db: Database,
	workspaceId: string,
	userId: string,
): Promise<MembershipRow | undefined> {
	return db
		.select()
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				eq(workspaceMembers.userId, userId),
			),
		)
		.get();
}
