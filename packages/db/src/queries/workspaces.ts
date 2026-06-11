import { and, eq } from "drizzle-orm";

import type { Database } from "../index";
import { workspaceMembers, workspaces } from "../schema/domain";

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type MembershipRow = typeof workspaceMembers.$inferSelect;

export async function createWorkspace(
	db: Database,
	input: { slug: string; name: string; timezone: string; ownerUserId: string },
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
				timezone: input.timezone,
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

export async function updateWorkspace(
	db: Database,
	id: string,
	patch: Partial<Pick<WorkspaceRow, "name" | "timezone" | "archivedAt">>,
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
