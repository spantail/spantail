# Permissions & resource visibility

This is the single source of truth for **who can read and write each resource** in
Spantail. It defines the intended model (the spec). Where the current code diverges
from this spec, it is called out explicitly under [Known gaps](#known-gaps).

Business logic lives in `packages/core`/`packages/db`; the REST API at `/api/v1` is the
only enforcement point. The Web SPA, CLI, and MCP are all clients of that API. The Web UI
intentionally exposes only a usability-driven subset of what the API allows — **the API and
MCP are not constrained by the UI and follow this spec directly.**

## Roles

| Role | Where it lives | Meaning |
|---|---|---|
| Instance admin | `user.isAdmin` (`packages/db/src/schema/auth.ts`) | System-wide super admin. |
| Template author | `user.canManageTemplates` | May author instance-wide report templates without being an instance admin. |
| Workspace owner | `workspace_members.role = "owner"` | Workspace creator. Same powers as workspace admin, but cannot be removed and the last admin cannot be demoted. |
| Workspace admin | `workspace_members.role = "admin"` | Manages a workspace and its resources/settings. |
| Workspace member | `workspace_members.role = "member"` | Belongs to a workspace. |
| Project member | (project-level membership — see [Gap D](#gap-d-project-membership-does-not-exist)) | Belongs to a specific project. |
| Self | the resource's owner (`userId` / `ownerUserId`) | The user who owns a user-scoped resource. |
| Agent (AAT) | an Agent Access Token (`requireAgentAuth`) | A non-human principal: an AI agent that **ingests** its own activity (agent entries/events) on behalf of its owner. Write-only ingest, scoped to the owner's workspace membership. |

Workspace roles are ranked `member < admin < owner` (`apps/web/src/server/lib/permissions.ts`).
"Workspace admin" in this document means **owner or admin** unless stated otherwise.

## Scopes

Every resource belongs to exactly one scope:

- **Instance** — one per deployment (users, invitations, instance settings, report templates).
- **Workspace** — owned by a workspace (settings, members, projects, unassigned work entries).
- **Project** — owned by a project within a workspace (project-assigned work/agent entries).
- **User** — owned by a single user, managed self-service (reports, inbox, API tokens, agents, account).
- **Report** — attached to a single report (shares, comments, reactions).

## Principles

1. **Instance admin** can read and write instance-, workspace-, and project-scoped resources and
   settings (the "containers"), **without requiring workspace/project membership** (admin bypass).
   For **user-scoped** resources, instance admin is **read-only** (never write — see self-service
   below). For **report-scoped** resources (shares, comments, reactions), instance admin is also
   **read-only** — writing them belongs to the report owner and discussion participants, not admins.
   Secrets are never exposed.
2. **Workspace admin** can read and write workspace resources and settings. For user-scoped
   resources belonging to that workspace's members, workspace admin is **read-only, limited to
   that workspace's data** (`R*`). Secrets are never exposed. (Resources with no workspace
   dimension — e.g. API tokens — are out of a workspace admin's reach; see notes on the matrix.)
3. **Template author** can read and write report templates.
4. **A user** can read and write their **own** user-scoped resources. User-scoped resources are
   **self-service**: only the owner may write them (see [Self-service](#self-service)).
5. **A workspace member** can read workspace resources that are **not under a project**
   (workspace settings, member list, project list/metadata, unassigned work entries).
6. **A project member** can read that **project's resources**. A user who is not a member of a
   project cannot read that project's resources.
7. **Secrets** (API token values, password) are never readable by anyone — not even the owner,
   except a token's value shown once at creation. The resource that *holds* a secret (e.g. the
   token list) is readable as metadata; the secret value itself is never returned.

### Self-service

User-scoped resources are managed by their owner only. Admins get **read** access (per
principles 1–2) but **never write** — there is no admin override for editing a user's reports,
tokens, agents, inbox, or account. This is intentional: data management is self-service.

> Off-boarding (an admin acting on a departed user's data) is a known future need. When it
> arrives it will be a dedicated, audited admin API — out of scope today.

## Access matrix

Legend: `RW` read+write · `R` read · `R*` read limited to the admin's own workspace data ·
`–` no access · `own` own resources only · `(secret hidden)` metadata readable, secret value never returned.

Columns: **WS Member** = workspace member who is *not* a project member · **Proj Member** = member
of the project in question (always also a workspace member) · **Self** = the resource's owner.

| Resource (scope) | Instance Admin | Workspace Admin | Template Author | WS Member | Proj Member | Self |
|---|---|---|---|---|---|---|
| Users / Invitations (instance) | RW | – | – | – | – | – |
| Instance settings: email/oauth/agents (instance) | RW | – | – | – | – | – |
| Report templates (instance) | RW | – | RW | R | R | R |
| Workspace settings (workspace) | RW | RW | – | R | R | – |
| Members (workspace) | RW | RW | – | R | R | – |
| Projects: list / metadata (workspace) | RW | RW | – | R | R | – |
| Projects: contained resources — work/agent entries (project) | R | R* | – | **–** | R | – |
| Work entries — project-assigned (project) | R | R* | – | **–** | R | RW (own) |
| Work entries — unassigned, `projectId = null` (workspace) | R | R | – | R | R | RW (own) |
| Agent entries / events (project / workspace) | R | R* | – | per project | per project | R (own); write via AAT |
| Reports (user) | R | R* | – | – | – | RW (own) |
| Inbox / deliveries (user) | R | R* | – | – | – | RW (own) |
| API tokens (user, secret hidden) | R (metadata) | – | – | – | – | RW (own, secret hidden) |
| Agents (user) | R | R* | – | – | – | RW (own) |
| Account / profile / avatar (user) | R | R | – | R | R | RW (own) |
| Password (secret) | – | – | – | – | – | W (own, value never visible) |
| Report shares (report) | R | R* | – | – | – | RW (own report) |
| Report discussion: comments / reactions (report) | R | R* | – | – | – | RW (participants; comments editable by author only) |

Notes:

- A **project member** can read everything a WS member can, plus the resources of the projects
  they belong to.
- **A project's contained resources are user-authored entries.** Admins/project members read them
  (per the row above and the work-entries rows), but **writes are always author-only** — no admin
  can edit or delete another user's entry. Only the project *container* (name, color, archive) is
  admin-writable, via the "Projects: list / metadata" row.
- **API tokens have no workspace dimension** — a token grants access across all of the owner's
  workspaces. There is no workspace-scoped view of a token, so workspace admins get no token
  access (`–`); only instance admins can read token metadata. Secret values are never returned.
- **Work entries are hybrid-scoped.** Writes are always author-only (self-service). Reads depend
  on `projectId`: assigned entries are project-scoped (project members + admins); unassigned
  entries (`projectId = null`, the state left when a project is deleted) are workspace-scoped.
- `R*` for workspace admins (reading a member's user-scoped resources limited to that workspace's
  data) has real implementation caveats — see [Gap C](#gap-c-workspace-admin-scoped-read-r).
- **Agent entries/events are written only by the agent's Access Token (AAT).** Ingest goes through
  `POST /api/v1/agent-entries` and `/api/v1/agent-events` guarded by `requireAgentAuth`, not by the
  owner's normal session/user permissions; each ingest is checked against the owner's live
  workspace membership. No human role writes these rows directly.

## UI vs API/MCP

- The Web SPA hides actions for usability (e.g. it never shows an edit/delete control on another
  user's work entry). This is convenience, not the security boundary.
- The REST API and MCP enforce this spec directly. **MCP** (the remote `/mcp` endpoint and the CLI
  stdio server) issues loopback REST calls carrying the caller's token, so every MCP tool inherits
  the exact same authorization as the REST API.
- Therefore the API/MCP surface is *broader* than the UI by design. It is never *intentionally*
  broader than this spec — the API never loosens a rule merely because the UI hides it.
- **Caveat (current state):** where [Known gaps](#known-gaps) exist the API can still exceed this
  spec until fixed. Most notably, with [Gap D](#gap-d-project-membership-does-not-exist) open,
  `GET /api/v1/work-entries` enforces only `requireWorkspaceAccess` (no project-membership check),
  so a plain workspace member can currently read project-assigned entries. The same data also
  leaks through **report rendering** — `POST /api/v1/reports/preview`, create, and update call
  `listWorkEntriesForReport` after only `requireScopeWorkspaces` — so locking down the list
  endpoint alone would not close the gap. Treat the gaps as the authoritative list of where
  today's API/MCP behavior diverges from this target.

## Known gaps

The current code diverges from this spec in the following ways. Each is tracked here as backlog;
this document is the target.

### Gap A — instance-admin workspace bypass not implemented

`requireWorkspaceAccess` (`apps/web/src/server/lib/permissions.ts`) requires membership for
everyone, so an instance admin who is not a member of a workspace gets `404` on its resources.
Principle 1 grants admin bypass. **Fix:** add an instance-admin bypass to `requireWorkspaceAccess`
(or a sibling helper) and propagate to the projects / members / work-entries / workspace-settings
routes.

### Gap B — admin read of user-, report-, and agent-scoped resources not implemented

Several read paths in the matrix grant admins access that the current endpoints do not yet
provide. All are strictly owner/participant-only today, so an admin (or member) following this
document would hit `404`. The matrix is the target; this gap lists every resource that needs an
admin (and, where the matrix says so, member/project) read path:

- **Reports** — `requireReportOwner` (`apps/web/src/server/routes/reports.ts`) is owner-only.
- **Inbox / deliveries** — owner-only (`apps/web/src/server/routes/inbox.ts`).
- **Agents** — owner-only (`apps/web/src/server/routes/agents.ts`).
- **API tokens** — owner-only; admin read is metadata only, secrets never returned.
- **Agent entries / events** — `GET /api/v1/agent-entries` and `/stats` always inject
  `ownerUserId: auth.user.id` (`apps/web/src/server/routes/agent-entries.ts`), and raw agent
  **events** have no read route at all. So today agent activity is owner-only: admins cannot read
  it and members cannot read project-scoped activity. Note this is independent of [Gap D](#gap-d-project-membership-does-not-exist) —
  closing the project ACL alone would not remove the existing `ownerUserId` filter; an explicit
  admin/member read path (and an events read route) is still required.
- **Report shares** — listing calls `requireReportOwner`
  (`apps/web/src/server/routes/reports.ts`), so admins cannot read another user's shares.
- **Report discussion** (comments / reactions) — `requireParticipant`
  (`apps/web/src/server/routes/report-discussion.ts`) limits access to the report owner or a
  Send-to recipient; admins have no read path.

**Fix:** add admin read paths for the resources above, backed by admin-scoped list queries in
`packages/db`. Confirm secrets stay hidden — token values are stored hashed and shown once at
creation; passwords are never returned.

### Gap C — workspace-admin scoped read (`R*`)

Letting a workspace admin read a member's user-scoped resources *limited to that workspace's data*
is non-trivial:

- **Reports** are frozen rendered-Markdown snapshots, so a per-workspace partial view is not
  feasible by slicing. Practical options: expose only reports whose filters resolve to that single
  workspace, or re-render workspace-scoped. Needs a decision.
- **API tokens** have no workspace dimension, so `R*` does not apply — token metadata is
  instance-admin-only (reflected in the matrix).
- **Inbox / deliveries** carry workspace context and can be filtered by workspace relatively easily.

### Gap D — project membership does not exist

There is no `project_members` table and no project-level access check
(`packages/db/src/schema/domain.ts`). Today **every workspace member can read every project's work
entries** — broader than principle 6 (the only over-permissive gap; the others are admin-narrower).

Closing this requires, roughly:

- a `project_members` table + migration (`pnpm db:generate`),
- a `requireProjectAccess`-style helper,
- filtering work-entry / project-contained queries by project membership,
- closing **every** read path to the same data, not just `GET /api/v1/work-entries`: report
  rendering (`listWorkEntriesForReport` via `POST /api/v1/reports/preview`, create, and update),
  work-entry stats/tags, and the agent-entry reads — otherwise reports remain a bypass,
- a project-member management UI with `en`/`ja` strings.

Granularity: a project's **list/metadata** (name, color) stays workspace-visible; only its
**contained** resources (entries) become project-member-only — as reflected in the matrix.

Because `work_entries.project_id` is nullable (set null on project delete), the read split must be
maintained: assigned entries → project members; unassigned entries → workspace members.

**Decision pending:** implement project ACL now, or keep this document's rule as the stated
direction and leave reads workspace-wide for now (YAGNI). Given the size (new table + migration +
ACL + UI), it warrants its own task.
