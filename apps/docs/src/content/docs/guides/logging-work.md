---
title: Logging work
description: Record work entries in the web UI.
---

A **work entry** is a record of something you did: a date, how long it took, a
short description, and optional notes and tags. Entries appear on your workspace
**timeline**, mixed in with AI-agent activity and sorted newest first.

## The dashboard timeline

Open a workspace from the sidebar to land on its dashboard. The timeline lists
recent entries; scroll to load more (50 at a time). Use the filters above the
list to narrow it by **period**, **project**, **member**, or **tag**.

:::note[Screenshot]
The workspace dashboard: the unified timeline with human work entries and agent
sessions, and the period/project/member/tag filters above it.
🚧 Image to be added.
:::

## Create an entry

Click the **+** button on the dashboard, or press <kbd>C</kbd> (when you're not
typing in a field). The entry dialog opens.

:::note[Screenshot]
The new-entry dialog with the date, duration, description, project, and tag
fields.
🚧 Image to be added.
:::

Fill in:

- **Date** — defaults to today, in your timezone. Set
  [your timezone](/guides/account-preferences/) so dates land on the right day.
- **Duration** — minutes, or an hours/minutes form. All of these are valid:
  `90`, `90m`, `2h`, `1h30m`.
- **Description** — what you worked on.
- **Project** *(optional)* — assign the entry to a project, or leave it blank to
  keep it workspace-wide. If you opened the dialog from a project page, that
  project is preselected.
- **Note** *(optional)* — longer free-form context.
- **Tags** *(optional)* — labels you can later filter and report on.

Save to add the entry to the timeline.

### Project-scoped vs. workspace-wide

An entry with a project belongs to that project; an entry without one is
workspace-wide. Both show on the dashboard timeline — the project assignment
only changes where else the entry appears and who can see it through project
membership.

## Edit or delete an entry

You can edit and delete **your own** entries from the timeline. Teammates' and
agents' entries are read-only to you. Workspace admins can read everyone's
entries but do not edit them on your behalf.

## Other ways to log work

The web UI is one of several clients of the same API. You can also log work from:

- The [CLI](/guides/tools/cli/): `spantail log "Fixed the build" --project website --duration 1h30m`
- An AI client over [MCP](/guides/tools/mcp/) using the `log_work` tool.
