import type { ReportTemplate } from "./report";

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
): ReportTemplate {
	return {
		id: `builtin:${key}`,
		workspaceId: null,
		name,
		description,
		body,
		builtin: true,
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
	),
	builtin(
		"weekly",
		"Weekly report",
		"Entries grouped by day with a per-project summary.",
		WEEKLY_BODY,
	),
	builtin(
		"monthly",
		"Monthly report",
		"Per-project and per-member totals as tables.",
		MONTHLY_BODY,
	),
];

export function getBuiltinTemplate(id: string): ReportTemplate | undefined {
	return builtinReportTemplates.find((template) => template.id === id);
}
