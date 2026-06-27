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

## The default template

A fresh instance starts with no templates. The first time the list is read, Spantail lazily
seeds a single **default template** (in the request's language) so reports are always composable.
The seed is idempotent — it is added once and never duplicated — and you can edit, disable, or
replace it like any other template.

## Managing templates

- **Create** a template with a name, an optional description, and a body.
- **Edit** its name, description, or body at any time.
- **Enable / disable** a template — disabled templates stay in the list but are hidden from the
  report-composer's picker.
- **Delete** a template you no longer need.

:::note[Screenshot]
*Placeholder — the template editor showing the name, description, and the Markdown + Liquid body.*
:::

## Writing a template

A template body is **Markdown** with **Liquid** placeholders. At render time Spantail fills in
the report's data — its name and note, the resolved period, totals, and the entries grouped by
project, date, or member — and produces Markdown. A duration filter formats minutes as
`1h 30m`. To see what a template produces, compose a [report](/guides/reports) with it.

### Safety

Report templates are user input, so rendering runs in a locked-down sandbox you do not need to
configure but should be aware of:

- Only a template's own data is reachable — no prototype access, and only the safe built-in
  filters.
- Parse, render, and memory limits are enforced.
- File/include tags are disabled, so a template cannot pull in other files.
- Rendered Markdown is displayed **without raw-HTML passthrough** — embedded HTML is not executed.

These protections cannot be turned off.
