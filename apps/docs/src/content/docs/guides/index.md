---
title: Getting started
description: Sign in, find your way around, and log your first work entry.
---

Spantail is a work observability platform: it records what people do as **work
entries** and captures AI-agent activity as **spans**, then turns both into
**reports**. This guide covers the day-to-day web app — signing in, logging
work, reading reports, and connecting your tools.

## Sign in

Open your instance URL and sign in on the login screen. Depending on how your
instance is configured, you can:

- **Sign in with email and password** — the default.
- **Sign in with Google or GitHub** — if your administrator enabled social
  login.
- **Accept an invitation** — if you received an invite link, open it to create
  your account and join the instance. You can set a name and password, or accept
  with Google/GitHub.

:::note[Screenshot]
The login screen, showing the email/password form and the social login buttons.
🚧 Image to be added.
:::

If you forgot your password, use **Forgot password** to receive a reset link.

## Find your way around

Once signed in, the app has two persistent areas:

- **Sidebar (left)** — workspace-scoped. A **workspace switcher** at the top,
  the workspace navigation below it, and a single **Settings** cog pinned at the
  bottom that opens the [Settings hub](/guides/account-preferences/). The sidebar
  collapses to icons on small screens.
- **Header (top-right)** — your user-scoped surfaces: **Reports**, your
  **inbox**, and the **user menu** (account, sign out).

:::note[Screenshot]
The app shell: the workspace sidebar on the left and the header with the
reports, inbox, and user menu in the top-right corner.
🚧 Image to be added.
:::

## Key concepts at a glance

| Concept | What it is |
|---|---|
| **Workspace** | An organizational unit (a team, department, or client). You can belong to several. |
| **Project** | A subdivision of a workspace. Work entries can be assigned to a project or left workspace-wide. |
| **Work entry** | A record of human work: a date, duration, description, optional note, and tags. |
| **Agent activity** | AI-agent sessions captured as spans, shown on the timeline alongside human work. |
| **Report** | A snapshot built from a template, filters, and a date range — readable, shareable, and discussable. |

Everything you log lives in a workspace. Reports are the exception: a report can
pull together your own work across all your workspaces, and the reports you
create are yours to share.

## Log your first entry

1. Open your workspace dashboard from the sidebar.
2. Click the **+** button (or press <kbd>C</kbd>).
3. Fill in the duration and a short description, pick a project if relevant, and
   save.

That's it — your entry appears on the timeline. See
[Logging work](/guides/logging-work/) for the full details.

## Where to go next

- [Logging work](/guides/logging-work/) — record work entries in the web UI.
- [Projects & timeline](/guides/projects-timeline/) — browse projects and your
  work timeline.
- [Reports & inbox](/guides/reports/) — create, share, and discuss reports.
- [Capturing agent activity](/guides/capturing-agents/) — capture AI-agent work
  as spans.
- [Account & preferences](/guides/account-preferences/) — API tokens, language,
  theme, and timezone.
- [CLI](/guides/tools/cli/) and [MCP](/guides/tools/mcp/) — log and read your
  data from outside the web app.
