import {
	createProjectInputSchema,
	updateProjectInputSchema,
} from "@toxil/core";
import {
	createProject,
	getProjectById,
	getProjectBySlug,
	listProjects,
	updateProject,
} from "@toxil/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import type { AppEnv } from "../types";

/** Nested under /workspaces/:id/projects — list and create. */
export const workspaceProjectRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId);
		return c.json(await listProjects(c.var.db, workspaceId));
	})
	.post("/", async (c) => {
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
		const project = await getProjectById(c.var.db, c.req.param("id"));
		if (!project) throw new AppError("not_found", "Project not found");
		await requireWorkspaceAccess(c, project.workspaceId);
		return c.json(project);
	})
	.patch("/:id", async (c) => {
		const project = await getProjectById(c.var.db, c.req.param("id"));
		if (!project) throw new AppError("not_found", "Project not found");
		await requireWorkspaceAccess(c, project.workspaceId, "admin");
		const input = validate(updateProjectInputSchema, await c.req.json());
		const updated = await updateProject(c.var.db, project.id, {
			...input,
			...(input.status === undefined
				? {}
				: { archivedAt: input.status === "archived" ? new Date() : null }),
		});
		return c.json(updated);
	});
