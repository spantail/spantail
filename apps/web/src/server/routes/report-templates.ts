import {
	builtinReportTemplates,
	createReportTemplateInputSchema,
	getBuiltinTemplate,
	isBuiltinTemplateId,
	mergeBuiltinTemplateState,
	resolveBuiltinTemplateSettings,
	updateReportTemplateInputSchema,
	updateReportTemplateStateInputSchema,
	type WorkspaceRole,
} from "@toxil/core";
import {
	countReportsByTemplateId,
	createReportTemplate,
	deleteReportTemplate,
	getReportTemplateById,
	listReportTemplates,
	type ReportTemplateRow,
	updateReportTemplate,
	updateWorkspace,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

function toApi(row: ReportTemplateRow) {
	return { ...row, builtin: false };
}

/** Loads a custom template and checks workspace membership (404 otherwise). */
async function requireTemplateAccess(
	c: Context<AppEnv>,
	id: string,
	minRole: WorkspaceRole = "member",
): Promise<ReportTemplateRow> {
	const template = await getReportTemplateById(c.var.db, id);
	if (!template) throw new AppError("not_found", "Report template not found");
	await requireWorkspaceAccess(c, template.workspaceId, minRole);
	return template;
}

/** Nested under /workspaces/:id/report-templates — list, create, state. */
export const workspaceReportTemplateRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		const workspaceId = c.req.param("id") ?? "";
		const { workspace } = await requireWorkspaceAccess(c, workspaceId);
		// Builtins are code-defined; their enabled/cadence come from this
		// workspace's settings overrides (the single source the client trusts).
		const builtins = builtinReportTemplates.map((template) => ({
			...template,
			...resolveBuiltinTemplateSettings(workspace.settings, template.id),
		}));
		const rows = await listReportTemplates(c.var.db, workspaceId);
		return c.json([...builtins, ...rows.map(toApi)]);
	})
	.post("/", async (c) => {
		const { user } = requireScope(c, "write");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId, "admin");
		const input = validate(createReportTemplateInputSchema, await c.req.json());
		const template = await createReportTemplate(c.var.db, {
			workspaceId,
			name: input.name,
			description: input.description ?? null,
			body: input.body,
			periodUnit: input.periodUnit,
			createdBy: user.id,
		});
		return c.json(toApi(template), 201);
	})
	// State (enabled/cadence) is admin-only and works for both kinds: custom
	// templates store it in their row; builtins store it in workspace settings.
	.patch("/:templateId/state", async (c) => {
		requireScope(c, "write");
		const workspaceId = c.req.param("id") ?? "";
		const templateId = c.req.param("templateId") ?? "";
		const { workspace } = await requireWorkspaceAccess(c, workspaceId, "admin");
		const input = validate(
			updateReportTemplateStateInputSchema,
			await c.req.json(),
		);
		if (isBuiltinTemplateId(templateId)) {
			if (!getBuiltinTemplate(templateId)) {
				throw new AppError("not_found", "Report template not found");
			}
			const settings = mergeBuiltinTemplateState(
				workspace.settings,
				templateId,
				input,
			);
			await updateWorkspace(c.var.db, workspaceId, { settings });
			return c.json({
				...getBuiltinTemplate(templateId),
				...resolveBuiltinTemplateSettings(settings, templateId),
			});
		}
		const template = await getReportTemplateById(c.var.db, templateId);
		if (!template || template.workspaceId !== workspaceId) {
			throw new AppError("not_found", "Report template not found");
		}
		const updated = await updateReportTemplate(c.var.db, template.id, input);
		if (!updated) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(updated));
	});

/** Flat /report-templates/:id — item operations. */
export const reportTemplateRoutes = new Hono<AppEnv>()
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const id = c.req.param("id");
		if (isBuiltinTemplateId(id)) {
			const builtin = getBuiltinTemplate(id);
			if (!builtin)
				throw new AppError("not_found", "Report template not found");
			return c.json(builtin);
		}
		return c.json(toApi(await requireTemplateAccess(c, id)));
	})
	.patch("/:id", async (c) => {
		requireScope(c, "write");
		const id = c.req.param("id");
		if (isBuiltinTemplateId(id)) {
			throw new AppError("forbidden", "Builtin templates are read-only");
		}
		const template = await requireTemplateAccess(c, id, "admin");
		const input = validate(updateReportTemplateInputSchema, await c.req.json());
		const updated = await updateReportTemplate(c.var.db, template.id, input);
		if (!updated) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(updated));
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const id = c.req.param("id");
		if (isBuiltinTemplateId(id)) {
			throw new AppError("forbidden", "Builtin templates are read-only");
		}
		const template = await requireTemplateAccess(c, id, "admin");
		if ((await countReportsByTemplateId(c.var.db, template.id)) > 0) {
			throw new AppError(
				"conflict",
				"This template is referenced by saved reports",
			);
		}
		await deleteReportTemplate(c.var.db, template.id);
		return c.body(null, 204);
	});
