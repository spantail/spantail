---
title: Account & preferences
description: API tokens, language, theme, and timezone.
---

Your personal settings — profile, preferences, sign-in methods, and API tokens —
live in the **Settings hub**. Open it with the **Settings** cog at the bottom of
the sidebar. The hub has a left sub-nav grouping every section; this page covers
the **Account** ones.

![The Settings hub with its left sub-nav; the Account section
selected.](../../../assets/account/01-settings-hub.png)

## Preferences

The **Preferences** page holds:

- **Profile photo** — an avatar, shown wherever your work appears.
- **Language** — the UI language (English or Japanese).
- **Timezone** — an IANA timezone (for example `Asia/Tokyo`). This matters:
  work-entry dates are frozen in your timezone when you write them, and reports
  resolve relative date ranges in it. Leaving it unset means UTC.
- **Theme** — system, light, or dark.

![The Preferences page with the profile photo, language, timezone, and theme
controls.](../../../assets/account/02-preferences.png)

## Authentication

Manage your **password** and your connected **Google / GitHub** accounts. The
available options depend on what your instance enabled.

## API tokens

To use the [CLI](/guides/tools/cli/), [MCP](/guides/tools/mcp/), or the REST API,
create a **personal API token** under **Settings → API tokens**.

- Choose a **scope**: read, write, or admin. Read and write are enough for
  logging work and running reports.
- The token value is shown **once**, at creation — copy it then. If you lose it,
  revoke it and create a new one.
- Tokens can be **revoked** at any time.

![The API tokens page: a newly created token shown once, above the list of
existing tokens.](../../../assets/account/03-tokens.png)
