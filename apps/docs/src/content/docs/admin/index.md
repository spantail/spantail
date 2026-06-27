---
title: Admin Guide overview
description: Who administers Spantail, and how to reach the settings that this guide covers.
---

This guide is for the people who run a Spantail instance and its workspaces: **instance
admins** who manage the whole deployment, and **workspace owners and admins** who manage a
single workspace and its projects and members.

Everything here is done from the **Settings** hub. Day-to-day usage — logging work, viewing
timelines, and composing reports — lives in the [User Guide](/guides/). Installing and
deploying the instance lives in the [Setup Guide](/self-hosting/).

## Who can administer what

Spantail separates **instance** administration from **workspace** administration. A person can
hold both.

| Role | Where it comes from | What it manages |
|---|---|---|
| **Instance admin** | The first signed-up user, plus anyone later granted the flag | Users, email, social login, the agents feature, and any workspace's settings/projects/members. Instance-scoped. |
| **Template author** | A per-user capability | Instance-wide report templates, without being an instance admin. |
| **Workspace owner** | The user who created the workspace | Everything an admin can, and cannot be removed or demoted below the last admin. |
| **Workspace admin** | A workspace role | That workspace's settings, projects, and members. |
| **Workspace member** | A workspace role | Nothing administrative — can read the workspace and log work. |

Admins manage the **containers** (workspaces, projects, members, instance settings), never a
user's own data. Reports, API tokens, agents, and account settings are self-service: even an
instance admin cannot edit another user's reports or tokens. Secrets are never shown to anyone.

## Reaching the settings

Open the **Settings** cog pinned at the bottom of the sidebar. The Settings hub groups every
management section in a left sub-nav:

- **Workspace** — General, Projects, Members (workspace owner/admin)
- **Account** — your own profile, password, API tokens, preferences (self-service)
- **Reporting** — Report templates (instance admin or template author)
- **System** — User management, AI agents, Email, Social login (instance admin only)

:::note[Screenshot]
*Placeholder — the Settings hub with the left sub-nav showing the Workspace, Account, Reporting, and System groups.*
:::

## What this guide covers

**Workspace administration** — manage a single workspace:

- [Workspace settings](/admin/workspace-settings) — name, URL, and logo
- [Projects](/admin/projects) — create, edit, archive, and staff projects
- [Members & roles](/admin/members) — add members and set their role

**Instance administration** — manage the whole deployment (instance admin):

- [User management](/admin/users) — create or invite users and grant capabilities
- [System settings](/admin/system-settings) — email, social login, and the agents feature
- [Report templates](/admin/report-templates) — author instance-wide report formats

First-time deployment — provisioning Cloudflare, configuring secrets, and creating the first
admin — is covered separately in the [Setup Guide](/self-hosting/).
