import {
	builtinReportTemplates,
	createReportTemplateInputSchema,
	getBuiltinTemplate,
	isBuiltinTemplateId,
	mergeBuiltinTemplateState,
	resolveBuiltinTemplateSettings,
	updateReportTemplateInputSchema,
	updateReportTemplateStateInputSchema,
} from "@toxil/core";
import {
	countReportsByTemplateId,
	createReportTemplate,
	deleteReportTemplate,
	getInstanceSettings,
	getReportTemplateById,
	listReportTemplates,
	type ReportTemplateRow,
	updateReportTemplate,
	upsertInstanceReportTemplateOverrides,
} from "@toxil/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireTemplateManager } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

function toApi(row: ReportTemplateRow) {
	return { ...row, builtin: false };
}

/**
 * Instance-scoped report templates. Templates are presentation formats with no
 * workspace binding: any authenticated user can read them to build a report,
 * while creating/editing/disabling is gated by requireTemplateManager. Builtins
 * are code-defined; their enabled/cadence overrides live on the instance row.
 */
export const reportTemplateRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		const settings = await getInstanceSettings(c.var.db);
		const builtins = builtinReportTemplates.map((template) => ({
			...template,
			...resolveBuiltinTemplateSettings(
				settings?.reportTemplateOverrides,
				template.id,
			),
		}));
		const rows = await listReportTemplates(c.var.db);
		return c.json([...builtins, ...rows.map(toApi)]);
	})
	.post("/", async (c) => {
		const { user } = requireTemplateManager(c);
		const input = validate(createReportTemplateInputSchema, await c.req.json());
		const template = await createReportTemplate(c.var.db, {
			name: input.name,
			description: input.description ?? null,
			body: input.body,
			periodUnit: input.periodUnit,
			createdBy: user.id,
		});
		return c.json(toApi(template), 201);
	})
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const id = c.req.param("id");
		if (isBuiltinTemplateId(id)) {
			const builtin = getBuiltinTemplate(id);
			if (!builtin)
				throw new AppError("not_found", "Report template not found");
			const settings = await getInstanceSettings(c.var.db);
			return c.json({
				...builtin,
				...resolveBuiltinTemplateSettings(
					settings?.reportTemplateOverrides,
					id,
				),
			});
		}
		const template = await getReportTemplateById(c.var.db, id);
		if (!template) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(template));
	})
	.patch("/:id", async (c) => {
		requireTemplateManager(c);
		const id = c.req.param("id");
		if (isBuiltinTemplateId(id)) {
			throw new AppError("forbidden", "Builtin templates are read-only");
		}
		const template = await getReportTemplateById(c.var.db, id);
		if (!template) throw new AppError("not_found", "Report template not found");
		const input = validate(updateReportTemplateInputSchema, await c.req.json());
		const updated = await updateReportTemplate(c.var.db, template.id, input);
		if (!updated) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(updated));
	})
	// State (enabled/cadence) is separate from body edits: custom templates store
	// it in their row; builtins store it in the instance overrides.
	.patch("/:id/state", async (c) => {
		requireTemplateManager(c);
		const id = c.req.param("id");
		const input = validate(
			updateReportTemplateStateInputSchema,
			await c.req.json(),
		);
		if (isBuiltinTemplateId(id)) {
			const builtin = getBuiltinTemplate(id);
			if (!builtin)
				throw new AppError("not_found", "Report template not found");
			const current = await getInstanceSettings(c.var.db);
			const overrides = mergeBuiltinTemplateState(
				current?.reportTemplateOverrides,
				id,
				input,
			);
			const row = await upsertInstanceReportTemplateOverrides(
				c.var.db,
				overrides,
			);
			return c.json({
				...builtin,
				...resolveBuiltinTemplateSettings(row.reportTemplateOverrides, id),
			});
		}
		const template = await getReportTemplateById(c.var.db, id);
		if (!template) throw new AppError("not_found", "Report template not found");
		const updated = await updateReportTemplate(c.var.db, template.id, input);
		if (!updated) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(updated));
	})
	.delete("/:id", async (c) => {
		requireTemplateManager(c);
		const id = c.req.param("id");
		if (isBuiltinTemplateId(id)) {
			throw new AppError("forbidden", "Builtin templates are read-only");
		}
		const template = await getReportTemplateById(c.var.db, id);
		if (!template) throw new AppError("not_found", "Report template not found");
		if ((await countReportsByTemplateId(c.var.db, template.id)) > 0) {
			throw new AppError(
				"conflict",
				"This template is referenced by saved reports",
			);
		}
		await deleteReportTemplate(c.var.db, template.id);
		return c.body(null, 204);
	});
