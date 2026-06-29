---
title: Report templates
description: Author the instance-wide formats that reports are rendered with.
---

**Settings → Reporting → Report templates.** Open to **instance admins** and users with the
**template-author** capability.

A template is a **presentation format** — nothing more. It is independent of any workspace,
project, user, or period: when someone composes a report they freely pair any template with any
scope and date range. Templates are instance-wide, so every workspace draws from the same list.

:::note[Screenshot]
*Placeholder — the Report templates list with each template's name, description, and enabled state.*
:::

## A starter template is always available

A fresh instance starts with no templates. The first time the list is read, Spantail lazily
seeds a single **starter template** (in the request's language) so reports are always composable.
The seed is idempotent — it is added once and never duplicated — and you can edit, disable, or
replace it like any other template.

## The default template

One template can be marked the **default** — the one the report composer preselects for a new
report. Use **Set as default** on a template to move the flag to it; at most one template holds
it at a time, and it shows a **Default** badge in the list. The default template cannot be
deleted or disabled while it holds the flag — set another template as default first to release
it. A freshly seeded starter template carries no default flag until you set one.

## Managing templates

- **Create** a template with a name, an optional description, and a body.
- **Edit** its name, description, or body at any time.
- **Enable / disable** a template — disabled templates stay in the list but are hidden from the
  report-composer's picker.
- **Set as default** — make this the template the report composer opens with (see
  [The default template](#the-default-template)).
- **Delete** a template you no longer need.

:::note[Screenshot]
*Placeholder — the template editor showing the name, description, and the Markdown + Liquid body.*
:::

## Writing a template

A template body is **Markdown** with **Liquid** placeholders. At render time Spantail fills in
the report's data — its name and note, the resolved period, totals, and the entries grouped by
project, date, or member — and produces Markdown. A duration filter formats minutes as
`1h 30m`. To see what a template produces, compose a [report](/guides/reports/) with it.

## Report defaults from a template

Besides the body, a template can pre-fill how a new report composed with it starts out:

- **Default report name** and **Default report note** — Liquid that generates the report's
  initial name and note. The report form adopts them and keeps them in sync until the author edits
  the field by hand. The data in scope here is `user`, `workspaces`, `projects`, `users`, and
  `period` — not the entries, which belong to the body.
- **Default date range** — the range a new report starts with: Today, Yesterday, This Week, Last
  Week, This Month, or Last Month. Leave it unset to fall back to Today.

### Safety

Report templates are user input, so rendering runs in a locked-down sandbox you do not need to
configure but should be aware of:

- Only a template's own data is reachable — no prototype access — and only the safe built-in
  filters are available.
- Parse, render, and memory limits are enforced.
- File/include tags are disabled, so a template cannot pull in other files.
- Rendered Markdown is displayed **without raw-HTML passthrough** — embedded HTML is not executed.

These protections cannot be turned off.
