---
title: Projects
description: Create, edit, archive, and staff the projects in a workspace.
---

**Settings → Workspace → Projects.** Visible to the workspace **owner** and **admins**.

Projects organize the work inside a workspace. Members assign work entries and agent activity to
a project, and reports can be scoped to one. Project membership also controls who can read a
project's entries.

:::note[Screenshot]
*Placeholder — the Projects list with each project's color, member avatars, and row actions.*
:::

## Create a project

Choose **New project** and set:

- **Name** — the project's display name.
- **URL** — a slug, used in project links. Lowercase letters, digits, and hyphens.
- **Description** — optional, shown alongside the project.
- **Color** — an accent hue that marks the project across timelines and reports.
- **Members** — optionally pick the initial members from the workspace's members.

:::note[Screenshot]
*Placeholder — the New project dialog with the name, URL, color picker, and member multi-select.*
:::

## Edit a project

Use a project's row actions to change its name, URL, description, or color at any time.

## Members

Project membership is binary — a user is either a member of a project or not; there is no
per-project role. Only project members (and workspace admins) can read that project's entries.
Manage a project's members from its row; the picker lists the workspace's members.

To add someone to a project, they must already be a member of the workspace — see
[Members & roles](/admin/members).

## Archive and restore

**Archive** a project to retire it without losing its history. Archived projects drop out of the
active pickers but keep all their entries, and you can **restore** them later.

## Delete a project

Deleting a project is permanent. Its work and agent entries are **not** deleted — they become
unassigned (their project link is cleared) and remain in the workspace. A confirmation step
spells this out before you proceed.

Prefer **archive** when you only want to retire a project; reserve **delete** for projects
created by mistake.
