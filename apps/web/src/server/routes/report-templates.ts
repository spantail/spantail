import {
	createReportTemplateInputSchema,
	updateReportTemplateInputSchema,
	updateReportTemplateStateInputSchema,
} from "@spantail/core";
import {
	countReportsByTemplateId,
	createReportTemplate,
	deleteReportTemplate,
	getReportTemplateById,
	listReportTemplates,
	type ReportTemplateRow,
	updateReportTemplate,
} from "@spantail/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireTemplateManager } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

function toApi(row: ReportTemplateRow) {
	return row;
}

/**
 * Instance-scoped report templates. Templates are presentation formats with no
 * workspace binding: any authenticated user can read them to build a report,
 * while creating/editing/disabling is gated by requireTemplateManager. A fresh
 * instance is seeded with a default template when its first admin is created.
 */
export const reportTemplateRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		const rows = await listReportTemplates(c.var.db);
		return c.json(rows.map(toApi));
	})
	.post("/", async (c) => {
		const { user } = requireTemplateManager(c);
		const input = validate(createReportTemplateInputSchema, await c.req.json());
		const template = await createReportTemplate(c.var.db, {
			name: input.name,
			description: input.description ?? null,
			body: input.body,
			createdBy: user.id,
		});
		return c.json(toApi(template), 201);
	})
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const id = c.req.param("id");
		const template = await getReportTemplateById(c.var.db, id);
		if (!template) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(template));
	})
	.patch("/:id", async (c) => {
		requireTemplateManager(c);
		const id = c.req.param("id");
		const template = await getReportTemplateById(c.var.db, id);
		if (!template) throw new AppError("not_found", "Report template not found");
		const input = validate(updateReportTemplateInputSchema, await c.req.json());
		const updated = await updateReportTemplate(c.var.db, template.id, input);
		if (!updated) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(updated));
	})
	// Enabling/disabling a template is separate from body edits and admin-gated.
	.patch("/:id/state", async (c) => {
		requireTemplateManager(c);
		const id = c.req.param("id");
		const input = validate(
			updateReportTemplateStateInputSchema,
			await c.req.json(),
		);
		const template = await getReportTemplateById(c.var.db, id);
		if (!template) throw new AppError("not_found", "Report template not found");
		const updated = await updateReportTemplate(c.var.db, template.id, input);
		if (!updated) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(updated));
	})
	.delete("/:id", async (c) => {
		requireTemplateManager(c);
		const id = c.req.param("id");
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
