import {
	createReportTemplateInputSchema,
	updateReportTemplateInputSchema,
	updateReportTemplateStateInputSchema,
} from "@spantail/core";
import {
	countReportsByTemplateId,
	createReportTemplate,
	deleteReportTemplateIfNotDefault,
	disableReportTemplateIfNotDefault,
	getReportTemplateById,
	listReportTemplates,
	type ReportTemplateRow,
	seedCatalogReportTemplates,
	setDefaultReportTemplate,
	updateReportTemplate,
} from "@spantail/db";
import { catalogTemplatesForLocale } from "@spantail/templates";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireTemplateManager } from "../lib/permissions";
import { pickShareLocale } from "../lib/share-page";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

function toApi(row: ReportTemplateRow) {
	return row;
}

/**
 * Instance-scoped report templates. Templates are presentation formats with no
 * workspace binding: any authenticated user can read them to build a report,
 * while creating/editing/disabling is gated by requireTemplateManager. Listing
 * lazily seeds the starter catalog (Daily, Weekly, Monthly; Daily is the
 * default) when the instance has none (a fresh or an upgraded instance that
 * previously relied on the removed builtins), so reports are always composable.
 */
export const reportTemplateRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		let rows = await listReportTemplates(c.var.db);
		if (rows.length === 0) {
			// Seed the starter catalog in the request's locale. Idempotent (fixed
			// ids + onConflictDoNothing), so concurrent first reads converge on one
			// row per template; only Daily carries isDefault.
			const catalog = catalogTemplatesForLocale(pickShareLocale(c));
			await seedCatalogReportTemplates(
				c.var.db,
				catalog.map((template) => ({
					id: template.key,
					name: template.name,
					description: template.description,
					body: template.body,
					isDefault: template.isDefault,
					nameTemplate: template.nameTemplate,
					noteTemplate: template.noteTemplate,
					defaultDateRange: template.defaultDateRange,
					createdBy: null,
				})),
			);
			rows = await listReportTemplates(c.var.db);
		}
		return c.json(rows.map(toApi));
	})
	.post("/", async (c) => {
		const { user } = requireTemplateManager(c);
		const input = validate(createReportTemplateInputSchema, await c.req.json());
		const template = await createReportTemplate(c.var.db, {
			name: input.name,
			description: input.description ?? null,
			body: input.body,
			nameTemplate: input.nameTemplate ?? null,
			noteTemplate: input.noteTemplate ?? null,
			defaultDateRange: input.defaultDateRange ?? null,
			createdBy: user.id,
		});
		// Keep the "exactly one default" invariant when a template is created on an
		// instance that has none yet (e.g. a POST before anyone lists templates, so
		// the lazy seed never ran): promote this row. setDefault clears any existing
		// default first, so it never trips the one-default unique index even under a
		// concurrent create that promoted a different row.
		const hasDefault = (await listReportTemplates(c.var.db)).some(
			(t) => t.isDefault,
		);
		if (!hasDefault) {
			const promoted = await setDefaultReportTemplate(c.var.db, template.id);
			return c.json(toApi(promoted ?? template), 201);
		}
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
		if (!input.enabled) {
			// The instance default must always stay available as the compose
			// fallback. The guard is applied inside the UPDATE so it holds even if a
			// concurrent set-default promotes this id between the read and the write.
			const disabled = await disableReportTemplateIfNotDefault(
				c.var.db,
				template.id,
			);
			if (!disabled) {
				throw new AppError(
					"conflict",
					"The default template cannot be disabled",
				);
			}
			return c.json(toApi(disabled));
		}
		const updated = await updateReportTemplate(c.var.db, template.id, {
			enabled: true,
		});
		if (!updated) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(updated));
	})
	// Makes this template the sole instance default (clears the previous one).
	.patch("/:id/default", async (c) => {
		requireTemplateManager(c);
		const id = c.req.param("id");
		const template = await getReportTemplateById(c.var.db, id);
		if (!template) throw new AppError("not_found", "Report template not found");
		// A disabled template can't be the compose fallback.
		if (!template.enabled) {
			throw new AppError(
				"conflict",
				"A disabled template cannot be the default",
			);
		}
		const updated = await setDefaultReportTemplate(c.var.db, template.id);
		if (!updated) throw new AppError("not_found", "Report template not found");
		return c.json(toApi(updated));
	})
	.delete("/:id", async (c) => {
		requireTemplateManager(c);
		const id = c.req.param("id");
		const template = await getReportTemplateById(c.var.db, id);
		if (!template) throw new AppError("not_found", "Report template not found");
		// The instance always keeps exactly one default; deleting it is blocked
		// (set another template as default first).
		if (template.isDefault) {
			throw new AppError("conflict", "The default template cannot be deleted");
		}
		if ((await countReportsByTemplateId(c.var.db, template.id)) > 0) {
			throw new AppError(
				"conflict",
				"This template is referenced by saved reports",
			);
		}
		// The is_default guard is part of the DELETE so a concurrent set-default
		// promoting this id between the check above and here can't drop the default.
		const deleted = await deleteReportTemplateIfNotDefault(
			c.var.db,
			template.id,
		);
		if (!deleted) {
			throw new AppError("conflict", "The default template cannot be deleted");
		}
		return c.body(null, 204);
	});
