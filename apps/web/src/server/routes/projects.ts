import {
	createProjectInputSchema,
	updateProjectInputSchema,
} from "@toxil/core";
import {
	createProject,
	deleteProject,
	getProjectById,
	getProjectBySlug,
	listProjects,
	updateProject,
} from "@toxil/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

/** Nested under /workspaces/:id/projects — list and create. */
export const workspaceProjectRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId);
		return c.json(await listProjects(c.var.db, workspaceId));
	})
	.post("/", async (c) => {
		requireScope(c, "write");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId, "admin");
		const input = validate(createProjectInputSchema, await c.req.json());
		if (await getProjectBySlug(c.var.db, workspaceId, input.slug)) {
			throw new AppError("conflict", "A project with this slug already exists");
		}
		const project = await createProject(c.var.db, { workspaceId, ...input });
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
		await requireWorkspaceAccess(c, project.workspaceId, "admin");
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
		return c.json(updated);
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const project = await getProjectById(c.var.db, c.req.param("id"));
		if (!project) throw new AppError("not_found", "Project not found");
		await requireWorkspaceAccess(c, project.workspaceId, "admin");
		// Only archived projects can be deleted, mirroring the UI guard.
		if (project.status !== "archived") {
			throw new AppError("conflict", "Archive the project before deleting it");
		}
		await deleteProject(c.var.db, project.id);
		return c.body(null, 204);
	});
