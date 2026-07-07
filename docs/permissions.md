# Permissions & resource visibility

This is the single source of truth for **who can read and write each resource** in
Spantail. It defines the model the implementation follows. A few deliberate
refinements are called out under [Intentional deviations](#intentional-deviations) so
they are not mistaken for divergence.

For the entities this model governs — what they are and how they relate — see
[`data-model.md`](./data-model.md).

Business logic lives in `packages/core`/`packages/db`; the REST API at `/api/v1` is the
only enforcement point. The Web SPA, CLI, and MCP are all clients of that API. The Web UI
intentionally exposes only a usability-driven subset of what the API allows — **the API and
MCP are not constrained by the UI and follow this spec directly.**

## Roles

| Role | Where it lives | Meaning |
|---|---|---|
| Instance admin | `user.isAdmin` (`packages/db/src/schema/auth.ts`) | System-wide super admin. |
| Template author | `user.canManageTemplates` | May author instance-wide report templates without being an instance admin. |
| Workspace owner | `workspace_members.role = "owner"` | Workspace creator. Same powers as workspace admin, but cannot be removed and the last admin cannot be demoted. The only workspace role that can **delete** the workspace. |
| Workspace admin | `workspace_members.role = "admin"` | Manages a workspace and its resources/settings. |
| Workspace member | `workspace_members.role = "member"` | Belongs to a workspace. |
| Project member | `project_members` (`packages/db/src/schema/domain.ts`) | Belongs to a specific project. Binary membership (no per-project role), managed by workspace admins. |
| Self | the resource's owner (`userId` / `ownerUserId`) | The user who owns a user-scoped resource. |
| Agent (AAT) | an Agent Access Token (`requireAgentAuth`) | A non-human principal: an AI agent that **ingests** its own activity (agent entries/events) on behalf of its owner. Write-only ingest, scoped to the owner's workspace membership. |

Workspace roles are ranked `member < admin < owner` (`apps/web/src/server/lib/permissions.ts`).
"Workspace admin" in this document means **owner or admin** unless stated otherwise.
An **instance admin satisfies any workspace-role requirement** regardless of whether (or with
what role) they happen to be a member — the admin bypass (Principle 1) is not demoted by an
incidental `member` row.

## Scopes

The short version: work data lives in a workspace, the instance level is administration, and
reports are the deliberate exception — cross-workspace and shareable. See the
[scope hierarchy](./data-model.md#scope-hierarchy) in `data-model.md` for that mental model in
full. Every resource belongs to exactly one scope:

- **Instance** — one per deployment (users, invitations, instance settings, report templates).
- **Workspace** — owned by a workspace (settings, members, projects, unassigned work entries).
- **Project** — owned by a project within a workspace (project-assigned work/agent entries).
- **User** — owned by a single user, managed self-service (reports, inbox, API tokens, agents, account).
- **Report** — attached to a report's immutable content versions (shares, comments, reactions);
  each resource references the exact version it was created against.

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
8. **An archived workspace is read-only.** Every write into it — work entries, agent ingest,
   projects, members, settings, logo, agent-token bindings — is rejected with `409 conflict`
   until it is unarchived, for every role including admins. Exactly two operations stay allowed:
   unarchiving (`PATCH` with `archived: false`, the only field the route accepts while archived)
   and deleting the workspace. Reads are unaffected. Enforced centrally in
   `requireWorkspaceAccess` / `requireAgentIngestWorkspace`
   (`apps/web/src/server/lib/permissions.ts`). Archiving itself is a workspace-settings write
   (workspace admin), but **deletion is owner-only** (plus instance admins via the bypass).

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
| GitHub App config (instance, secrets hidden) | RW | – | – | – | – | – |
| GitHub repo mappings (workspace) | RW | RW | – | R | R | – |
| GitHub identity link (user) | – | – | – | – | – | RW (own, via verified OAuth) |
| Report templates (instance) | RW | – | RW | R | R | R |
| Workspace settings (workspace) | RW | RW | – | R | R | – |
| Members (workspace) | RW | RW | – | R | R | – |
| Projects: list / metadata (workspace) | RW | RW | – | R | R | – |
| Projects: contained resources — work/agent entries (project) | R | R* | – | **–** | R | – |
| Work entries — project-assigned (project) | R | R* | – | **–** | R | RW (own) |
| Work entries — unassigned, `projectId = null` (workspace) | R | R | – | R | R | RW (own) |
| Agent entries / events (project / workspace) | R | R* | – | per project | per project | R + delete (own); write via AAT |
| Reports (user) | R | R* | – | – | – | RW (own) |
| Inbox / deliveries (user) | R | R* | – | – | – | RW (own) |
| API tokens (user, secret hidden) | R (metadata) | – | – | – | – | RW (own, secret hidden) |
| Agents (user) | R | R* | – | – | – | RW (own) |
| Account / profile / avatar (user) | R | R | – | R | R | RW (own) |
| Password (secret) | – | – | – | – | – | W (own, value never visible) |
| Report shares (content version) | R | R* | – | – | – | RW (own report) |
| Delivery shares (delivery) | – | – | – | – | – | RW (own received copy) |
| Report discussion: comments / reactions (content version) | R | R* | – | – | – | RW (participants: owner + that version's recipients; comments editable by author only) |

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
- **A report's content is owner-scoped by default.** Rendering restricts entries to the owner's
  own work unless `filters.userIds` lists other authors. The web app never sets `userIds`, so a
  web-created report always covers only the owner's entries — even an instance-scope report
  spanning every workspace, and even for an instance admin. Including other authors is an API-only
  path and is still bounded by the owner's entry-read access (the rows above).
- **`R*` for workspace admins** (reading a member's user-scoped resources limited to that
  workspace's data) is realized through **single-workspace reports**: a workspace admin reads a
  report — and, by extension, its inbox deliveries, shares, and discussion — only when the report
  is scoped to exactly that one workspace (`filters.workspaceIds === [thatWorkspace]`). A
  multi-workspace report is not a per-workspace partial view, so it stays instance-admin-only
  (`R`). The admin read is addressed by query param: `?ownerUserId` (instance admin, `R`) or
  `?workspaceId` (workspace admin, `R*`) on the collection endpoints; both run through the
  scope-based guards, so they are reachable over PAT/MCP.
- **Agent entries** carry a denormalized `workspaceId`, so an admin read is scoped directly by it:
  a workspace/instance admin reads all agent activity in the workspace (`R`/`R*`), a member reads
  only their projects' activity plus their own. Raw agent **events** (per-turn telemetry) have **no
  read route** for any role — only aggregated agent entries are readable.
- **Share links are creator-owned.** A share references an immutable content version and is
  managed (listed, revoked) only by whoever minted it — the report owner from the report screen,
  or a delivery recipient from a received message. The two mint paths never see each other's
  links. **Delivery shares follow the email model**: the received copy is the recipient's (they
  can already download it), so minting re-checks no workspace membership — the sender's
  recipient validation at send time is the dissemination gate. Admin visibility of delivery
  shares is deliberately not provided (v1); admins can read the delivery body itself via the
  inbox rows above.
- **Agent entries/events are written only by the agent's Access Token (AAT).** Ingest goes through
  `POST /api/v1/agent-entries`, `/api/v1/agent-events`, and `/api/v1/agent-events/finalize` guarded
  by `requireAgentAuth`, not by the owner's normal session/user permissions; each ingest is checked
  against the owner's live workspace membership. The one human-role write is **deletion**: the
  entry's owner (and only the owner) may bulk-delete their own agent entries via
  `POST /api/v1/agent-entries/delete` with a session/PAT `write` scope.
- **GitHub-originated writes act as the linked user, never as the App.** A `@spantail`
  comment creates a work entry only when the commenter's GitHub account (matched by
  immutable numeric user id) is linked to a Spantail user who is a member of the mapped
  workspace — the normal author-only write, just triggered from GitHub. GitHub org
  membership or repo `author_association` grants nothing by itself; it only gates whether
  the bot replies at all (insiders get onboarding/error replies, outsiders get silence).
  The `#N` log-work API path runs under the caller's own PAT/session with the same
  workspace/project checks as a direct work-entry create. Whether an App is configured
  (`GET /instance/github/enabled`, a boolean) is readable by any signed-in user to gate
  the Connect card.

## UI vs API/MCP

- The Web SPA hides actions for usability (e.g. it never shows an edit/delete control on another
  user's work entry). This is convenience, not the security boundary.
- The REST API and MCP enforce this spec directly. **MCP** (the remote `/mcp` endpoint and the CLI
  stdio server) issues loopback REST calls carrying the caller's token, so every MCP tool inherits
  the exact same authorization as the REST API.
- Therefore the API/MCP surface is *broader* than the UI by design. It is never *intentionally*
  broader than this spec — the API never loosens a rule merely because the UI hides it.
- The REST API and MCP enforce this spec directly, with no known divergence — there is no class of
  resource where the API exceeds or falls short of this matrix.

## Intentional deviations

The implementation matches this spec. A few behaviors are deliberate refinements, called out here
so they are not mistaken for divergence:

- **Workspace-admin `R*` is single-workspace-only.** A workspace admin reads a member's reports,
  inbox deliveries, shares, and discussion only for reports scoped to exactly that one workspace;
  a multi-workspace report is not a per-workspace partial view, so it stays instance-admin-only
  (`R`). The admin read is addressed by `?ownerUserId` (instance admin) or `?workspaceId`
  (workspace admin) on the collection endpoints. See the Access matrix notes.
- **Frozen snapshots are point-in-time.** The project ACL is enforced at live render/read time, so
  a snapshot captures exactly what its author could see when it was generated. Persisted report
  content (`GET /api/v1/reports/:id`, `GET /api/v1/inbox/:id`, public `/share/:token`) is not
  re-filtered on later reads.
- **Raw agent events have no read route.** Only aggregated agent entries are readable; per-turn
  event telemetry is write-only (ingest), for every role.
- **Agent-entry deletion is owner-only.** No admin override: agent entries are the owner's own
  telemetry, and admins never write user data (see [Self-service](#self-service)). The bulk route
  is all-or-nothing and answers 404 (not 403) for any id that is missing or foreign, so it cannot
  be used to probe other users' session ids.
- **Work-entry → agent-entry links assert provenance, not visibility.** When a work entry is
  created from agent sessions (`agentEntryIds` on `POST /api/v1/work-entries`), every linked entry
  must be the caller's **own** — being able to *read* a colleague's session (admin or project
  member) is not enough, since a link claims "my work came from this session". The read side is
  the reverse and does not widen visibility: `GET /api/v1/work-entries/:id/agent-entries` (the
  entry dialog's session summary) requires read access to the work entry, then filters the linked
  sessions by the **same** private-by-default agent-entry ACL as `GET /api/v1/agent-entries`, so a
  viewer sees only the subset of linked sessions they could already read directly (a non-owner may
  get an empty list).
- **Off-boarding is future work.** Admins never *write* user-scoped resources (see
  [Self-service](#self-service)); acting on a departed user's data will be a dedicated, audited
  admin API when the need arrives.
