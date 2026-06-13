import { z } from "zod";

import { localDateSchema, shiftDays, todayInTimezone } from "./common";
import { tagSchema } from "./work-entry";

export const dateRangePresetSchema = z.enum([
	"today",
	"yesterday",
	"this_week",
	"last_week",
	"this_month",
	"last_month",
]);
export type DateRangePreset = z.infer<typeof dateRangePresetSchema>;

export const absoluteDateRangeSchema = z
	.object({
		from: localDateSchema,
		to: localDateSchema,
	})
	.refine((range) => range.from <= range.to, "from must be on or before to");
export type AbsoluteDateRange = z.infer<typeof absoluteDateRangeSchema>;

export const reportDateRangeSchema = z.union([
	dateRangePresetSchema,
	absoluteDateRangeSchema,
]);
export type ReportDateRange = z.infer<typeof reportDateRangeSchema>;

export const reportFiltersSchema = z.object({
	workspaceIds: z.array(z.string()).min(1).max(20),
	projectIds: z.array(z.string()).max(50).optional(),
	userIds: z.array(z.string()).max(50).optional(),
	tags: z.array(tagSchema).max(20).optional(),
	dateRange: reportDateRangeSchema,
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/** Filters as stored on a snapshot: the date range is frozen to absolute dates. */
export const resolvedReportFiltersSchema = reportFiltersSchema.extend({
	dateRange: absoluteDateRangeSchema,
});
export type ResolvedReportFilters = z.infer<typeof resolvedReportFiltersSchema>;

export const reportTemplateSchema = z.object({
	id: z.string(),
	// Null only for builtin templates, which are code-defined, not workspace rows.
	workspaceId: z.string().nullable(),
	name: z.string().min(1).max(100),
	description: z.string().max(1000).nullable(),
	body: z.string().min(1).max(50000),
	builtin: z.boolean(),
	createdBy: z.string().nullable(),
	createdAt: z.string().nullable(),
	updatedAt: z.string().nullable(),
});
export type ReportTemplate = z.infer<typeof reportTemplateSchema>;

export const createReportTemplateInputSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(1000).optional(),
	body: z.string().min(1).max(50000),
});
export type CreateReportTemplateInput = z.infer<
	typeof createReportTemplateInputSchema
>;

export const updateReportTemplateInputSchema = z
	.object({
		name: z.string().min(1).max(100),
		description: z.string().max(1000).nullable(),
		body: z.string().min(1).max(50000),
	})
	.partial();
export type UpdateReportTemplateInput = z.infer<
	typeof updateReportTemplateInputSchema
>;

export const reportSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100),
	ownerUserId: z.string(),
	templateId: z.string(),
	filters: reportFiltersSchema,
	// Free-form markdown appended to the rendered output via {{ report.note }}.
	note: z.string().max(20000).nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type Report = z.infer<typeof reportSchema>;

export const createReportInputSchema = z.object({
	name: z.string().min(1).max(100),
	templateId: z.string().min(1),
	filters: reportFiltersSchema,
	note: z.string().max(20000).optional(),
});
export type CreateReportInput = z.infer<typeof createReportInputSchema>;

export const updateReportInputSchema = z
	.object({
		name: z.string().min(1).max(100),
		templateId: z.string().min(1),
		filters: reportFiltersSchema,
		note: z.string().max(20000).nullable(),
	})
	.partial();
export type UpdateReportInput = z.infer<typeof updateReportInputSchema>;

export const reportSnapshotSchema = z.object({
	id: z.string(),
	reportId: z.string(),
	renderedMarkdown: z.string(),
	resolvedFilters: resolvedReportFiltersSchema,
	generatedAt: z.string(),
});
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;

export const reportSnapshotMetaSchema = reportSnapshotSchema.omit({
	renderedMarkdown: true,
});
export type ReportSnapshotMeta = z.infer<typeof reportSnapshotMetaSchema>;

export const BUILTIN_TEMPLATE_ID_PREFIX = "builtin:";

export function isBuiltinTemplateId(id: string): boolean {
	return id.startsWith(BUILTIN_TEMPLATE_ID_PREFIX);
}

/** Last day of the month as `YYYY-MM-DD`; monthIndex is 0-based (UTC math). */
export function lastDayOfMonth(year: number, monthIndex: number): string {
	return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

/**
 * Resolves a date range to absolute local dates. Presets are anchored to
 * today in the given timezone; weeks start on Monday.
 */
export function resolveDateRange(
	range: ReportDateRange,
	timezone: string,
	now: Date = new Date(),
): AbsoluteDateRange {
	if (typeof range !== "string") return range;

	const today = todayInTimezone(timezone, now);
	switch (range) {
		case "today":
			return { from: today, to: today };
		case "yesterday": {
			const yesterday = shiftDays(today, -1);
			return { from: yesterday, to: yesterday };
		}
		case "this_week":
		case "last_week": {
			const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
			let monday = shiftDays(today, -((dow + 6) % 7));
			if (range === "last_week") monday = shiftDays(monday, -7);
			return { from: monday, to: shiftDays(monday, 6) };
		}
		case "this_month":
		case "last_month": {
			const [y = 0, m = 1] = today.split("-").map(Number);
			// Date.UTC normalizes monthIndex -1 into December of the prior year.
			const monthIndex = m - 1 - (range === "last_month" ? 1 : 0);
			const first = new Date(Date.UTC(y, monthIndex, 1));
			return {
				from: first.toISOString().slice(0, 10),
				to: lastDayOfMonth(first.getUTCFullYear(), first.getUTCMonth()),
			};
		}
	}
}

/** Keeps entries that carry at least one of the filter tags (no tags = all). */
export function filterEntriesByTags<T extends { tags: string[] }>(
	entries: T[],
	tags?: string[],
): T[] {
	if (!tags || tags.length === 0) return entries;
	const wanted = new Set(tags);
	return entries.filter((entry) => entry.tags.some((tag) => wanted.has(tag)));
}
