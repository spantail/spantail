import {
	builtinReportTemplates,
	createReportTemplateInputSchema,
	getBuiltinTemplate,
	isBuiltinTemplateId,
	updateReportTemplateInputSchema,
} from "@toxil/core";
import {
	countReportsByTemplateId,
	createReportTemplate,
	deleteReportTemplate,
	getReportTemplateById,
	listReportTemplates,
	type ReportTemplateRow,
	updateReportTemplate,
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
): Promise<ReportTemplateRow> {
	const template = await getReportTemplateById(c.var.db, id);
	if (!template) throw new AppError("not_found", "Report template not found");
	await requireWorkspaceAccess(c, template.workspaceId);
	return template;
}

/** Nested under /workspaces/:id/report-templates — list and create. */
export const workspaceReportTemplateRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId);
		const rows = await listReportTemplates(c.var.db, workspaceId);
		return c.json([...builtinReportTemplates, ...rows.map(toApi)]);
	})
	.post("/", async (c) => {
		const { user } = requireScope(c, "write");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId);
		const input = validate(createReportTemplateInputSchema, await c.req.json());
		const template = await createReportTemplate(c.var.db, {
			workspaceId,
			name: input.name,
			description: input.description ?? null,
			body: input.body,
			createdBy: user.id,
		});
		return c.json(toApi(template), 201);
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
		const template = await requireTemplateAccess(c, id);
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
		const template = await requireTemplateAccess(c, id);
		if ((await countReportsByTemplateId(c.var.db, template.id)) > 0) {
			throw new AppError(
				"conflict",
				"This template is referenced by saved reports",
			);
		}
		await deleteReportTemplate(c.var.db, template.id);
		return c.body(null, 204);
	});
