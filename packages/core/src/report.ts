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

/** Cadence of a report and of the template that produces it. */
export const periodUnitSchema = z.enum(["day", "week", "month", "custom"]);
export type PeriodUnit = z.infer<typeof periodUnitSchema>;

/** Inclusive day count between two local dates (`YYYY-MM-DD`). */
function dateRangeSpanDays(from: string, to: string): number {
	const utcMs = (date: string) => {
		const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
		return Date.UTC(y, m - 1, d);
	};
	return (utcMs(to) - utcMs(from)) / 86_400_000 + 1;
}

/** Reports render entries synchronously on write, so the period is bounded. */
export const MAX_REPORT_SPAN_DAYS = 366;

/** Upper bound on a rendered/hand-edited report body (generous vs templates). */
export const MAX_REPORT_MARKDOWN_LENGTH = 500_000;

export const absoluteDateRangeSchema = z
	.object({
		from: localDateSchema,
		to: localDateSchema,
	})
	.refine((range) => range.from <= range.to, "from must be on or before to")
	.refine(
		(range) => dateRangeSpanDays(range.from, range.to) <= MAX_REPORT_SPAN_DAYS,
		`date range must span at most ${MAX_REPORT_SPAN_DAYS} days`,
	);
export type AbsoluteDateRange = z.infer<typeof absoluteDateRangeSchema>;

/** A date range on the wire: a preset (resolved server-side) or absolute dates. */
export const reportDateRangeSchema = z.union([
	dateRangePresetSchema,
	absoluteDateRangeSchema,
]);
export type ReportDateRange = z.infer<typeof reportDateRangeSchema>;

/** Filters as stored on a report: the date range is always absolute. */
export const reportFiltersSchema = z.object({
	workspaceIds: z.array(z.string()).min(1).max(20),
	projectIds: z.array(z.string()).max(50).optional(),
	userIds: z.array(z.string()).max(50).optional(),
	tags: z.array(tagSchema).max(20).optional(),
	dateRange: absoluteDateRangeSchema,
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/** Filters on the create/update wire: the date range may still be a preset. */
export const reportFiltersInputSchema = reportFiltersSchema.extend({
	dateRange: reportDateRangeSchema,
});
export type ReportFiltersInput = z.infer<typeof reportFiltersInputSchema>;

export const reportTemplateSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100),
	description: z.string().max(1000).nullable(),
	body: z.string().min(1).max(50000),
	builtin: z.boolean(),
	// Admin-controlled: disabled templates are hidden from the report tabs.
	enabled: z.boolean(),
	// Cadence used to default a new report's period, name, and Duplicate step.
	periodUnit: periodUnitSchema,
	createdBy: z.string().nullable(),
	createdAt: z.string().nullable(),
	updatedAt: z.string().nullable(),
});
export type ReportTemplate = z.infer<typeof reportTemplateSchema>;

export const createReportTemplateInputSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(1000).optional(),
	body: z.string().min(1).max(50000),
	periodUnit: periodUnitSchema.default("custom"),
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

/** State changes (enabled/cadence) are separate from body edits and admin-gated. */
export const updateReportTemplateStateInputSchema = z
	.object({
		enabled: z.boolean(),
		periodUnit: periodUnitSchema,
	})
	.partial();
export type UpdateReportTemplateStateInput = z.infer<
	typeof updateReportTemplateStateInputSchema
>;
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
	// Total logged minutes across the report's entries, computed at render time.
	// Null for reports generated before this was tracked (shown until re-rendered).
	totalMinutes: z.number().int().nonnegative().nullable(),
	// The rendered document, produced on create and refreshed on edit.
	renderedMarkdown: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type Report = z.infer<typeof reportSchema>;

/** A report without its rendered body, for list payloads. */
export const reportMetaSchema = reportSchema.omit({ renderedMarkdown: true });
export type ReportMeta = z.infer<typeof reportMetaSchema>;

/**
 * Query for a report listing. Filters are applied server-side so a paginated
 * page is populated even when the result set is skewed (templateId is the tab;
 * from/to overlap the report's period; projectId scopes by project). limit is
 * optional: omitted returns the full filtered set (prev/next navigation needs
 * it); the list view passes limit/offset to scroll.
 */
export const listReportsQuerySchema = z.object({
	templateId: z.string().optional(),
	projectId: z.string().optional(),
	from: localDateSchema.optional(),
	to: localDateSchema.optional(),
	limit: z.coerce.number().int().min(1).max(200).optional(),
	offset: z.coerce.number().int().min(0).optional(),
});
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
// z.coerce fields have an `unknown` input type; clients send numbers.
export type ListReportsQueryData = {
	templateId?: string;
	projectId?: string;
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
};

export const createReportInputSchema = z.object({
	name: z.string().min(1).max(100),
	templateId: z.string().min(1),
	filters: reportFiltersInputSchema,
	note: z.string().max(20000).optional(),
});
export type CreateReportInput = z.infer<typeof createReportInputSchema>;

/**
 * A report is a snapshot rendered once at creation. Editing is a direct,
 * manual revision of the frozen document — only the title and body change.
 * The template, filters, and note are provenance of that snapshot and stay
 * immutable (the list filters and sidebar group by them, so they must keep
 * matching what generated the report); to regenerate from source, delete and
 * recreate.
 */
export const updateReportInputSchema = z
	.object({
		name: z.string().min(1).max(100),
		renderedMarkdown: z.string().min(1).max(MAX_REPORT_MARKDOWN_LENGTH),
	})
	.partial();
export type UpdateReportInput = z.infer<typeof updateReportInputSchema>;

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
