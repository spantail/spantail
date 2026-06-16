import {
	createWorkspaceInputSchema,
	updateWorkspaceInputSchema,
} from "@toxil/core";
import {
	createWorkspace,
	getWorkspaceBySlug,
	listWorkspacesForUser,
	updateWorkspace,
} from "@toxil/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";
import { memberRoutes } from "./members";
import { workspaceProjectRoutes } from "./projects";
import { workspaceReportTemplateRoutes } from "./report-templates";

export const workspaceRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const { user } = requireScope(c, "read");
		return c.json(await listWorkspacesForUser(c.var.db, user.id));
	})
	.post("/", async (c) => {
		const { user } = requireScope(c, "admin");
		if (!user.isAdmin) {
			throw new AppError(
				"forbidden",
				"Only instance admins can create workspaces",
			);
		}
		const input = validate(createWorkspaceInputSchema, await c.req.json());
		if (await getWorkspaceBySlug(c.var.db, input.slug)) {
			throw new AppError(
				"conflict",
				"A workspace with this slug already exists",
			);
		}
		const workspace = await createWorkspace(c.var.db, {
			...input,
			ownerUserId: user.id,
		});
		return c.json(workspace, 201);
	})
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const { workspace } = await requireWorkspaceAccess(c, c.req.param("id"));
		return c.json(workspace);
	})
	.patch("/:id", async (c) => {
		requireScope(c, "admin");
		const workspaceId = c.req.param("id");
		await requireWorkspaceAccess(c, workspaceId, "admin");
		const input = validate(updateWorkspaceInputSchema, await c.req.json());
		const { archived, ...rest } = input;
		if (rest.slug !== undefined) {
			const existing = await getWorkspaceBySlug(c.var.db, rest.slug);
			if (existing && existing.id !== workspaceId) {
				throw new AppError(
					"conflict",
					"A workspace with this slug already exists",
				);
			}
		}
		const updated = await updateWorkspace(c.var.db, workspaceId, {
			...rest,
			...(archived === undefined
				? {}
				: { archivedAt: archived ? new Date() : null }),
		});
		return c.json(updated);
	})
	.route("/:id/members", memberRoutes)
	.route("/:id/projects", workspaceProjectRoutes)
	.route("/:id/report-templates", workspaceReportTemplateRoutes);
