import {
	addProjectMemberInputSchema,
	createProjectInputSchema,
	updateProjectInputSchema,
} from "@spantail/core";
import {
	addProjectMember,
	createProject,
	deleteProject,
	getMembership,
	getProjectById,
	getProjectBySlug,
	listMembersByProject,
	listProjectIdsForMember,
	listProjectMembers,
	listProjects,
	removeProjectMember,
	updateProject,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { resolveAvatarUrl } from "../lib/avatar";
import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import { publishToWorkspace } from "../realtime/publish";
import type { AppEnv } from "../types";

/** Maps a member row to the API shape, resolving the avatar URL. */
function toApiProjectMember<T extends { userId: string; image: string | null }>(
	row: T,
) {
	const { image, ...rest } = row;
	return { ...rest, imageUrl: resolveAvatarUrl(row.userId, image) };
}

/** Loads a project and asserts the caller is a member of its workspace. */
async function requireProjectByWorkspace(c: Context<AppEnv>, id: string) {
	const project = await getProjectById(c.var.db, id);
	if (!project) throw new AppError("not_found", "Project not found");
	const access = await requireWorkspaceAccess(c, project.workspaceId);
	return { project, ...access };
}

/** Nested under /workspaces/:id/projects — list and create. */
export const workspaceProjectRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId);
		return c.json(await listProjects(c.var.db, workspaceId));
	})
	// Static segments before any future "/:id" so they are never captured as ids.
	// Members of every project in the workspace, for the projects table's avatar
	// stacks (one query instead of a request per project).
	.get("/members", async (c) => {
		requireScope(c, "read");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId);
		const rows = await listMembersByProject(c.var.db, workspaceId);
		return c.json(
			rows.map(({ image, ...rest }) => ({
				...rest,
				imageUrl: resolveAvatarUrl(rest.userId, image),
			})),
		);
	})
	// The project ids the caller belongs to in this workspace — drives the entry
	// form's "projects I can log to" picker.
	.get("/mine", async (c) => {
		const { user } = requireScope(c, "read");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId);
		return c.json(
			await listProjectIdsForMember(c.var.db, workspaceId, user.id),
		);
	})
	.post("/", async (c) => {
		requireScope(c, "write");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId, "admin", { write: true });
		const input = validate(createProjectInputSchema, await c.req.json());
		if (await getProjectBySlug(c.var.db, workspaceId, input.slug)) {
			throw new AppError("conflict", "A project with this slug already exists");
		}
		const { memberUserIds, ...projectInput } = input;
		// Every initial member must already be a member of the workspace.
		for (const userId of memberUserIds ?? []) {
			if (!(await getMembership(c.var.db, workspaceId, userId))) {
				throw new AppError(
					"bad_request",
					"Member is not part of this workspace",
				);
			}
		}
		const project = await createProject(c.var.db, {
			workspaceId,
			...projectInput,
		});
		for (const userId of memberUserIds ?? []) {
			await addProjectMember(c.var.db, project.id, userId);
		}
		publishToWorkspace(c, { type: "project", workspaceId });
		return c.json(project, 201);
	});

/** Flat /projects/:id — item operations, scoped via the project's workspace. */
export const projectRoutes = new Hono<AppEnv>()
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const project = await getProjectById(c.var.db, c.req.param("id"));
		if (!project) throw new AppError("not_found", "Project not found");
		await requireWorkspaceAccess(c, project.workspaceId);
		return c.json(project);
	})
	.patch("/:id", async (c) => {
		requireScope(c, "write");
		const project = await getProjectById(c.var.db, c.req.param("id"));
		if (!project) throw new AppError("not_found", "Project not found");
		await requireWorkspaceAccess(c, project.workspaceId, "admin", {
			write: true,
		});
		const input = validate(updateProjectInputSchema, await c.req.json());
		if (input.slug !== undefined && input.slug !== project.slug) {
			const existing = await getProjectBySlug(
				c.var.db,
				project.workspaceId,
				input.slug,
			);
			if (existing && existing.id !== project.id) {
				throw new AppError(
					"conflict",
					"A project with this slug already exists",
				);
			}
		}
		const updated = await updateProject(c.var.db, project.id, {
			...input,
			...(input.status === undefined
				? {}
				: { archivedAt: input.status === "archived" ? new Date() : null }),
		});
		publishToWorkspace(c, {
			type: "project",
			workspaceId: project.workspaceId,
		});
		return c.json(updated);
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const project = await getProjectById(c.var.db, c.req.param("id"));
		if (!project) throw new AppError("not_found", "Project not found");
		await requireWorkspaceAccess(c, project.workspaceId, "admin", {
			write: true,
		});
		// Only archived projects can be deleted, mirroring the UI guard.
		if (project.status !== "archived") {
			throw new AppError("conflict", "Archive the project before deleting it");
		}
		await deleteProject(c.var.db, project.id);
		publishToWorkspace(c, {
			type: "project",
			workspaceId: project.workspaceId,
		});
		return c.body(null, 204);
	})
	// --- project members (workspace admins manage; members can view) ---
	.get("/:id/members", async (c) => {
		requireScope(c, "read");
		const { project } = await requireProjectByWorkspace(c, c.req.param("id"));
		const members = await listProjectMembers(c.var.db, project.id);
		return c.json(members.map(toApiProjectMember));
	})
	.post("/:id/members", async (c) => {
		requireScope(c, "write");
		const project = await getProjectById(c.var.db, c.req.param("id"));
		if (!project) throw new AppError("not_found", "Project not found");
		await requireWorkspaceAccess(c, project.workspaceId, "admin", {
			write: true,
		});
		const input = validate(addProjectMemberInputSchema, await c.req.json());
		// A project member must already belong to the project's workspace.
		if (!(await getMembership(c.var.db, project.workspaceId, input.userId))) {
			throw new AppError(
				"bad_request",
				"User is not a member of this workspace",
			);
		}
		await addProjectMember(c.var.db, project.id, input.userId);
		const members = await listProjectMembers(c.var.db, project.id);
		const added = members.find((m) => m.userId === input.userId);
		return c.json(added ? toApiProjectMember(added) : undefined, 201);
	})
	.delete("/:id/members/:userId", async (c) => {
		requireScope(c, "write");
		const project = await getProjectById(c.var.db, c.req.param("id"));
		if (!project) throw new AppError("not_found", "Project not found");
		await requireWorkspaceAccess(c, project.workspaceId, "admin", {
			write: true,
		});
		await removeProjectMember(c.var.db, project.id, c.req.param("userId"));
		return c.body(null, 204);
	});
