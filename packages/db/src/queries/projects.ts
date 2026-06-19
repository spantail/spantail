import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "../index";
import { projects } from "../schema/domain";

export type ProjectRow = typeof projects.$inferSelect;

export async function createProject(
	db: Database,
	input: {
		workspaceId: string;
		slug: string;
		name: string;
		description?: string;
		hue?: number;
	},
): Promise<ProjectRow> {
	const rows = await db
		.insert(projects)
		.values({ id: crypto.randomUUID(), ...input })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("project insert returned no row");
	return row;
}

export async function getProjectById(
	db: Database,
	id: string,
): Promise<ProjectRow | undefined> {
	return db.select().from(projects).where(eq(projects.id, id)).get();
}

export async function getProjectBySlug(
	db: Database,
	workspaceId: string,
	slug: string,
): Promise<ProjectRow | undefined> {
	return db
		.select()
		.from(projects)
		.where(and(eq(projects.workspaceId, workspaceId), eq(projects.slug, slug)))
		.get();
}

export async function listProjects(
	db: Database,
	workspaceId: string,
): Promise<ProjectRow[]> {
	return db
		.select()
		.from(projects)
		.where(eq(projects.workspaceId, workspaceId))
		.orderBy(projects.createdAt);
}

export async function listProjectsByIds(
	db: Database,
	ids: string[],
): Promise<ProjectRow[]> {
	if (ids.length === 0) return [];
	return db.select().from(projects).where(inArray(projects.id, ids));
}

export async function updateProject(
	db: Database,
	id: string,
	patch: Partial<
		Pick<
			ProjectRow,
			"name" | "slug" | "description" | "hue" | "status" | "archivedAt"
		>
	>,
): Promise<ProjectRow | undefined> {
	const rows = await db
		.update(projects)
		.set(patch)
		.where(eq(projects.id, id))
		.returning();
	return rows[0];
}

/** Deletes a project. Entries logged against it are kept; their project_id is
 * set to null by the `work_entries` foreign key (`ON DELETE SET NULL`). */
export async function deleteProject(db: Database, id: string): Promise<void> {
	await db.delete(projects).where(eq(projects.id, id));
}
