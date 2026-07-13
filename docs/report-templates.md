# Report templates

A report template is an instance-scoped **presentation format**: Markdown with
[LiquidJS](https://liquidjs.com/) tags, rendered against a report's data at run time. A template
carries no workspace, project, user, or period — a report freely combines any template with any
scope and date range when it is created.

The **starter catalog** (from `@spantail/templates`) is seeded once at instance bootstrap, when the
first user — the instance admin — signs up, in that admin's language, so reports can always be
composed. Beyond that, instance admins and
[template authors](permissions.md) author their own under **Settings → Reporting → Report
templates**. The samples below are starting points — copy one in and adapt it.

> Period is **not** a template attribute. The date range (today, this week, last month, a custom
> span) is chosen per report at run time; the same template renders any period.

## Available data

The render context exposes:

| Variable | Description |
|---|---|
| `report.name` | The report's title. |
| `report.note` | Free-form Markdown note (truth-test it: `{% if report.note %}`). |
| `period.from`, `period.to` | The resolved date range (`YYYY-MM-DD`). |
| `generated_date` | When the report was rendered. |
| `totals.minutes`, `totals.entries` | Total logged minutes and entry count. |
| `groups.by_project` | Entries grouped by project; each group has `name`, `total_minutes`, `entries`. |
| `groups.by_date` | Entries grouped by day; each group has `key`, `total_minutes`, `entries`. |
| `groups.by_user` | Entries grouped by member; each group has `name`, `total_minutes`, `entries`. |
| `entry.description`, `entry.duration_minutes`, `entry.user_name`, `entry.project_name`, `entry.tags` | Per-entry fields. |
| `agents` | Registered agents in scope; each has `id`, `name`, `type`. |
| `agent_entries` | The AI-agent sessions in scope; iterate for the per-session fields below. |
| `totals.agents` | AI-agent rollup: `sessions`, `minutes`, `hours`, `tokens`, `input_tokens`, `output_tokens`. |
| `agent_groups.by_agent` | Agent sessions grouped by agent; each group has `name`, `session_count`, `total_minutes`, `total_tokens`, `entries` (also `by_date`, `by_project`, `by_user`). |
| `agent_entry.duration_minutes`, `agent_entry.total_tokens`, `agent_entry.input_tokens`, `agent_entry.output_tokens`, `agent_entry.cost_usd`, `agent_entry.model`, `agent_entry.agent_name` | Per-session fields (iterate `agent_entries`). |

Agent-activity notes: sessions carry no tags, so a report's tag filter never narrows them. Token
buckets are optional per agent, so `input_tokens + output_tokens` can be less than `total_tokens`,
and a source that exposes no usage contributes `0`. Guard the section with
`{% if totals.agents.sessions > 0 %}` so it renders only when there is agent activity.

Filters: `format_duration` (minutes to `1h 30m`), plus the standard safe LiquidJS filters
(`size`, `join`, …). For safety, raw-HTML passthrough, file/include tags, and prototype access are
disabled.

## Samples

### Daily — entries grouped by project (English)

```liquid
# {{ report.name }}

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
{% if report.note -%}
## Notes

{{ report.note }}

{% endif -%}
---

_Generated {{ generated_date }}_
```

### Weekly — entries by day with a per-project summary (English)

```liquid
# {{ report.name }}

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
---

_Generated {{ generated_date }}_
```

### Monthly — per-project and per-member totals as tables (English)

```liquid
# {{ report.name }}

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
---

_Generated {{ generated_date }}_
```

### 日報 — プロジェクト別（日本語）

```liquid
# {{ report.name }}

**期間:** {{ period.from }}{% if period.to != period.from %} – {{ period.to }}{% endif %} · **合計:** {{ totals.minutes | format_duration }}（{{ totals.entries }}件）

{% if totals.entries == 0 -%}
_この期間の稼働記録はありません。_

{% else -%}
{% for group in groups.by_project -%}
## {{ group.name }} — {{ group.total_minutes | format_duration }}

{% for entry in group.entries -%}
- {{ entry.description }}（{{ entry.duration_minutes | format_duration }}、{{ entry.user_name }}{% if entry.tags.size > 0 %}、タグ: {{ entry.tags | join: ", " }}{% endif %}）
{% endfor %}
{% endfor -%}
{% endif -%}
{% if report.note -%}
## 備考

{{ report.note }}

{% endif -%}
---

_生成日時 {{ generated_date }}_
```

### 月報 — プロジェクト別・メンバー別の集計（日本語）

```liquid
# {{ report.name }}

**期間:** {{ period.from }} – {{ period.to }} · **合計:** {{ totals.minutes | format_duration }}（{{ totals.entries }}件）

{% if totals.entries == 0 -%}
_この期間の稼働記録はありません。_

{% else -%}
## プロジェクト別

| プロジェクト | 件数 | 合計 |
| --- | --- | --- |
{% for group in groups.by_project -%}
| {{ group.name }} | {{ group.entries | size }} | {{ group.total_minutes | format_duration }} |
{% endfor %}
## メンバー別

| メンバー | 件数 | 合計 |
| --- | --- | --- |
{% for group in groups.by_user -%}
| {{ group.name }} | {{ group.entries | size }} | {{ group.total_minutes | format_duration }} |
{% endfor %}
{% endif -%}
---

_生成日時 {{ generated_date }}_
```
