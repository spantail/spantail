import { z } from "zod";

import {
	type PeriodUnit,
	periodUnitSchema,
	type ReportTemplate,
} from "./report";

// Builtin template bodies are content shipped with the product, not UI
// strings; they are English-only for now (en/ja split tracked for M6).

const FOOTER = `{% if report.note -%}
## Notes

{{ report.note }}

{% endif -%}
---

_Generated {{ generated_date }}_
`;

const DAILY_BODY = `# {{ report.name }}

**Period:** {{ period.from }}{% if period.to != period.from %} – {{ period.to }}{% endif %} · **Total:** {{ totals.minutes | format_duration }} ({{ totals.entries }} entries)

{% if totals.entries == 0 -%}
_No work entries in this period._

{% else -%}
{% for group in groups.by_project -%}
## {{ group.name }} — {{ group.total_minutes | format_duration }}

{% for entry in group.entries -%}
- {{ entry.description }} ({{ entry.duration_minutes | format_duration }}, {{ entry.user_name }}{% if entry.tags.size > 0 %}, tags: {{ entry.tags | join: ", " }}{% endif %})
{% endfor %}
{% endfor -%}
{% endif -%}
${FOOTER}`;

const WEEKLY_BODY = `# {{ report.name }}

**Period:** {{ period.from }} – {{ period.to }} · **Total:** {{ totals.minutes | format_duration }} ({{ totals.entries }} entries)

{% if totals.entries == 0 -%}
_No work entries in this period._

{% else -%}
{% for day in groups.by_date -%}
## {{ day.key }} — {{ day.total_minutes | format_duration }}

{% for entry in day.entries -%}
- **{{ entry.project_name }}** {{ entry.description }} ({{ entry.duration_minutes | format_duration }}, {{ entry.user_name }})
{% endfor %}
{% endfor -%}
## By project

{% for group in groups.by_project -%}
- {{ group.name }} — {{ group.total_minutes | format_duration }}
{% endfor %}
{% endif -%}
${FOOTER}`;

const MONTHLY_BODY = `# {{ report.name }}

**Period:** {{ period.from }} – {{ period.to }} · **Total:** {{ totals.minutes | format_duration }} ({{ totals.entries }} entries)

{% if totals.entries == 0 -%}
_No work entries in this period._

{% else -%}
## By project

| Project | Entries | Total |
| --- | --- | --- |
{% for group in groups.by_project -%}
| {{ group.name }} | {{ group.entries | size }} | {{ group.total_minutes | format_duration }} |
{% endfor %}
## By member

| Member | Entries | Total |
| --- | --- | --- |
{% for group in groups.by_user -%}
| {{ group.name }} | {{ group.entries | size }} | {{ group.total_minutes | format_duration }} |
{% endfor %}
{% endif -%}
${FOOTER}`;

function builtin(
	key: string,
	name: string,
	description: string,
	body: string,
	periodUnit: PeriodUnit,
): ReportTemplate {
	return {
		id: `builtin:${key}`,
		name,
		description,
		body,
		builtin: true,
		// Defaults; an instance admin can override enabled/periodUnit per builtin.
		enabled: true,
		periodUnit,
		createdBy: null,
		createdAt: null,
		updatedAt: null,
	};
}

export const builtinReportTemplates: ReportTemplate[] = [
	builtin(
		"daily",
		"Daily report",
		"Entries grouped by project for a single day.",
		DAILY_BODY,
		"day",
	),
	builtin(
		"weekly",
		"Weekly report",
		"Entries grouped by day with a per-project summary.",
		WEEKLY_BODY,
		"week",
	),
	builtin(
		"monthly",
		"Monthly report",
		"Per-project and per-member totals as tables.",
		MONTHLY_BODY,
		"month",
	),
];

export function getBuiltinTemplate(id: string): ReportTemplate | undefined {
	return builtinReportTemplates.find((template) => template.id === id);
}

/** Admin-controlled instance-wide state for a builtin template. */
export interface ReportTemplateState {
	enabled: boolean;
	periodUnit: PeriodUnit;
}

const templateOverrideEntrySchema = z.object({
	enabled: z.boolean().optional(),
	periodUnit: periodUnitSchema.optional(),
});

/**
 * Instance-wide enabled/cadence overrides for builtin templates, keyed by
 * builtin id (e.g. "builtin:daily"). Builtin bodies are code-defined; only
 * their state is configurable, and it now lives on the single instance row
 * rather than per workspace.
 */
export const reportTemplateOverridesSchema = z.record(
	z.string(),
	templateOverrideEntrySchema,
);
export type ReportTemplateOverrides = z.infer<
	typeof reportTemplateOverridesSchema
>;

function readOverrides(
	overrides: ReportTemplateOverrides | null | undefined,
): ReportTemplateOverrides {
	const parsed = reportTemplateOverridesSchema.safeParse(overrides ?? {});
	return parsed.success ? parsed.data : {};
}

/** Resolves a builtin's effective enabled/cadence for the instance. */
export function resolveBuiltinTemplateSettings(
	overrides: ReportTemplateOverrides | null | undefined,
	builtinId: string,
): ReportTemplateState {
	const base = getBuiltinTemplate(builtinId);
	const defaults: ReportTemplateState = {
		enabled: base?.enabled ?? true,
		periodUnit: base?.periodUnit ?? "custom",
	};
	const override = readOverrides(overrides)[builtinId];
	if (!override) return defaults;
	return {
		enabled: override.enabled ?? defaults.enabled,
		periodUnit: override.periodUnit ?? defaults.periodUnit,
	};
}

/** Returns new instance overrides with a builtin's state merged in. */
export function mergeBuiltinTemplateState(
	overrides: ReportTemplateOverrides | null | undefined,
	builtinId: string,
	patch: Partial<ReportTemplateState>,
): ReportTemplateOverrides {
	const all = { ...readOverrides(overrides) };
	all[builtinId] = { ...all[builtinId], ...patch };
	return all;
}
