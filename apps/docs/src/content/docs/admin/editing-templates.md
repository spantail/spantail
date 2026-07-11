---
title: Editing templates
description: Write a report template's Markdown + Liquid body, format dates, and set its report defaults.
---

Open a template from [Report templates](/admin/report-templates) to edit it. The editor has the
template's name, an optional description, and its **body** — the Markdown + Liquid that defines
what a report rendered with it looks like.

![The template editor showing the name, description, and the Markdown + Liquid
body.](../../../assets/admin/template-editor.png)

## The template body

A template body is **Markdown** with **Liquid** placeholders. At render time Spantail fills in
the report's data — its name and note, the resolved period, totals, and the entries grouped by
project, date, or member — and produces Markdown. AI-agent activity is available too:
`totals.agents` (session count, minutes, and tokens) and `agent_groups` / `agent_entries` for a
per-agent or per-session breakdown. A duration filter formats minutes as `1h 30m`. To see what a
template produces, compose a [report](/guides/reports/) with it.

## Formatting dates

Dates reach a template as plain `YYYY-MM-DD` strings — the resolved period (`period.from`,
`period.to`), each entry's `entry_date`, and the generation date (`generated_date`). Pass one
through the `format_date` filter to render it as a localized date with a weekday, in the report's
language: `{{ period.from | format_date }}` → `Mon, Jun 1` (`6月1日(月)` in Japanese).

By default the year appears only when the date falls outside the report's generation year, so a
report about the current year stays uncluttered. An argument overrides this:

- `{{ date | format_date }}` — weekday and month/day; the year shows only for other years.
- `{{ date | format_date: 'year' }}` — always show the year (`Mon, Jun 1, 2026`).
- `{{ date | format_date: 'no-year' }}` — never show the year.

The starter template passes `'year'`, so its period and generation lines always carry the year.
Clock times are not shown by `format_date`; durations use `format_duration` (`1h 30m`).

## Report defaults from a template

Besides the body, a template can pre-fill how a new report composed with it starts out:

- **Default report name** and **Default report note** — Liquid that generates the report's
  initial name and note. The report form adopts them and keeps them in sync until the author edits
  the field by hand. The data in scope here is `user`, `workspaces`, `projects`, `users`, and
  `period` — not the entries, which belong to the body.
- **Default date range** — the range a new report starts with: Today, Yesterday, This Week, Last
  Week, This Month, or Last Month. Leave it unset to fall back to Today.

## Safety

Report templates are user input, so rendering runs in a locked-down sandbox you do not need to
configure but should be aware of:

- Only a template's own data is reachable — no prototype access — and only the safe built-in
  filters are available.
- Parse, render, and memory limits are enforced.
- File/include tags are disabled, so a template cannot pull in other files.
- Rendered Markdown is displayed **without raw-HTML passthrough** — embedded HTML is not executed.

These protections cannot be turned off.
