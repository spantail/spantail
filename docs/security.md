# Security threat model

This is the canonical reference for the **security properties and standing threats
specific to Spantail** — the ones that fall out of what Spantail *is* (a self-hostable,
open-source work-observability platform that captures AI-agent activity) rather than from
generic web or supply-chain concerns. It records the invariants contributors must preserve
and the trade-offs that are deliberate, so neither is mistaken for a bug.

It is a companion to [`permissions.md`](./permissions.md) (who may read and write each
resource) and [`data-model.md`](./data-model.md) (the entities and how they relate); the
architecture invariants in [`CLAUDE.md`](../CLAUDE.md) come first. Where a rule already
lives in one of those, this doc summarizes and links rather than restating it.

Enforcement is server-side. The REST API at `/api/v1` and the MCP endpoint are the gate
for every client — the Web SPA, CLI, and MCP are all clients of that API, so **never trust
the client**. The public `/share/:token` page is itself a server-rendered surface in
`apps/web`, not an API client. Route handlers in `apps/web/src/server` enforce the
properties below (authentication, scoping, response hardening), calling the shared
validation and domain logic that lives in `packages/core` / `packages/db`.

## 1. Ingested data is untrusted input

The accuracy of the captured data **is the product**, and the write path is the primary
attack surface: agents and the CLI ingest through long-lived, write-only Agent Access
Tokens (AATs) that live on developer machines and CI, so token leakage is a realistic
threat. Treat every ingested field as hostile.

Standing rules:

- **Bound every field.** String lengths, numeric ranges, array sizes, and timestamps all
  carry explicit limits, defined once in `packages/core` so web/CLI/MCP enforce them
  identically. A value with no plausible ceiling (a duration, a date) is a bug.
- **Rate-limit and quota the write path.** Ingestion endpoints must not let one token
  exhaust D1 or inflate the operator's storage/cost.
- **Validate, don't just format-check.** ISO-8601 shape is not a date-range check;
  `min(0)` is not an upper bound.
- **Schema-on-read payloads are still bounded on write.** Fields stored verbatim and read
  defensively later (an event's raw `usage`, its `attributes` metadata, an entry's
  `context` facets) get size/count/length caps at ingest, and every read of them treats
  the stored value as hostile (type-checked, length-checked, never coerced).

A token is write-only ingest, scoped to its owner's workspace membership, re-checked live
at ingest time — but that only governs *where* it may write, not *what* it may write. The
bounds above are what protect the data itself.

## 2. Captured agent activity may contain sensitive content

Spantail records AI-agent activity verbatim and human work as free text, so span
descriptions, notes, and event payloads can contain **secrets, source-code fragments, or
PII** — an agent may paste an API key into a description without anyone intending it.
Event `attributes` and entry `context` are metadata, not transcript content, but not
innocuous either: a branch name, repository URL, or working directory can reveal internal
project names or customer identifiers, and they fan out with everything else.

That content flows downstream: ingest → reports (Liquid → Markdown) → public share links →
Send-to deliveries. The standing rule is to treat captured content as potentially
secret-bearing along that entire path:

- Never forward raw captured content to an external sink (application logs, analytics, a
  third-party LLM) where it could leak or be retained.
- Operator guidance: do not emit secrets into agent logs; captured content is stored and
  may be shared.
- Any redaction / secret-detection belongs at the client (CLI/MCP) or at ingest, not after
  the data has already fanned out.

## 3. Report templates and rendered output are untrusted

Report templates are user input and their rendered output is shown to humans. The
rendering invariants are defined in [`CLAUDE.md`](../CLAUDE.md) ("Report templates are user
input"); in summary:

- LiquidJS runs with safety settings: own-property access only, strict filters,
  parse/render/memory limits, and `include`/`render`/`layout`/`block` tags disabled
  (`packages/core/src/report-engine.ts`).
- Rendered Markdown is displayed with **no raw-HTML passthrough** — the SPA uses
  `react-markdown` without `rehype-raw`, and the server twin
  (`apps/web/src/server/lib/markdown.ts`) drops raw HTML and adds `rehype-sanitize` as
  defense in depth.

## 4. Sharing is a capability-URL model

A public report share is reachable by **knowing its token** — there is no logged-in
session behind it. That makes the token a bearer secret and sets a checklist that every
new public surface must satisfy:

- High-entropy, non-guessable, non-enumerable token; unknown/revoked/expired all collapse
  to a byte-identical 404 (no existence leak).
- Response hardening: `noindex`, `no-store`, `Referrer-Policy: no-referrer`, and a
  restrictive CSP, so the content is never indexed or cached and the token never leaks via
  `Referer`.
- Revocable and expirable; optional passcode gate.
- Only the intended version body is exposed — a share references one immutable
  `report_content` version, and the machine-readable front-matter (filters, ids,
  provenance) is stripped before it is rendered.

Send-to deliveries and owner-minted public shares enforce an ACL computed from the report's
**frozen** snapshot (`snapshotProjectIds` + `snapshotWorkspaceIds`): a recipient must be a
member of the snapshot's rendered workspaces and able to read every project in it, and the
owner must still cover that frozen workspace scope to disseminate — checked at send/share time
against the frozen sets, not the stored filter (empty for instance scope) or live memberships,
so there is no live/stored drift. See [`permissions.md`](./permissions.md) for the full matrix.

There is a **second mint path**: a Send-to recipient may re-share their received copy from the
Messages view (the email model — the delivered version is theirs, and they can already download
or print it). That mint deliberately re-checks no workspace membership; the sender's recipient
validation at send time is the dissemination gate, and the resulting link serves exactly the
delivered version. Each link is managed only by its creator; revocation remains the containment
tool for both paths.

## 5. Snapshots are point-in-time and intentionally not re-filtered

A report snapshot captures exactly what its author could see when it was generated, and
persisted content is **not re-filtered against live entries on later reads** — see
[`permissions.md`](./permissions.md). The deliberate consequence differs by surface:

- The **owner** reading their own report (`GET /api/v1/reports/:id`) still has workspace
  membership re-checked against the snapshot's **frozen render scope**
  (`snapshotWorkspaceIds`, falling back to `filters.workspaceIds` on legacy rows), so losing
  **workspace** membership revokes access. This holds for instance scope too: it stores an empty
  `filters.workspaceIds`, but the gate uses the frozen scope, so a cross-user snapshot (not
  own-only) is never left ungated. Losing only a **project** ACL (while remaining a workspace
  member) does not — the snapshot still shows the projects the author could read at render time.
- A **public share** (`/share/:token`) or a **Send-to delivery** is reached by capability
  token / recipient identity, with no live membership check, so an already-shared or
  delivered copy stays viewable even after the author or recipient loses access.

This is a usability-vs-exposure trade-off, not a leak: a saved link must not break
unpredictably, and the stored snapshot is disconnected from live access control.
Contributors must not "fix" it by re-filtering stored content, and operators should know to
**revoke existing shares** when membership changes if the historical content is sensitive.
(For the owner's report-screen path, creating *new* shares after access loss is correctly
blocked; a delivery recipient retains re-share capability over their received copy like any
email recipient — see §4. Revoking is always allowed.)

## 6. Authorization scoping (summary)

The access model is owned by [`permissions.md`](./permissions.md); its security-relevant
invariants:

- Every read is scoped by **workspace membership**, and project-assigned data is further
  gated by **project ACL** (`entryAccessCondition`). There is no code path that fetches a
  resource by id without also checking the caller's membership/ownership.
- Cross-scope report filters are validated against the **union of the caller's
  workspaces**; a workspace admin cannot read a multi-workspace report (instance-admin
  only).
- Privilege boundaries hold in one direction: a workspace admin has no path to
  instance-admin, and workspace member management cannot escalate to it.

## 7. Tokens and accounts

- Personal Access Tokens and Agent Access Tokens are **hashed at rest**, scoped (AAT is
  write-only ingest), expirable, and revocable.
- A **disabled account is locked out at every auth path** — session, PAT, AAT, and MCP —
  not just on next login.
- Auth responses **do not leak account existence** (uniform errors; password-reset
  delivery is deferred so response timing does not reveal whether an account exists), and
  the API returns structured JSON errors with no stack traces.
- The bootstrap admin is the first email/password sign-up; public sign-up closes
  immediately afterward, and social login is unavailable until an admin exists — so there
  is no window to claim admin on a fresh instance.

## 8. Self-hosting: secure defaults, fail closed

Spantail is operated by self-hosters who are not security specialists, so an insecure
default is an insecure deployment. The rule is **fail closed**:

- Critical secrets (e.g. the session-signing secret) must be validated at startup; a
  missing or empty value must stop the instance rather than silently degrade to forgeable
  sessions.
- Optional integrations (OAuth providers, email) stay disabled unless fully configured —
  no half-configured surface is exposed.
- `wrangler.jsonc` carries only non-secret ids; secrets come from `wrangler secret` /
  `.dev.vars` (gitignored), never the repo.
- Defense in depth for that last rule on a public/forkable repo (both free on public
  repositories): enable **GitHub secret scanning** (detects credentials already present in
  the repo and its history) and **push protection** (blocks a recognized secret from being
  pushed in the first place), and register a custom pattern for Spantail's own token formats
  — `spantail_(pat|aat)_[A-Za-z0-9_-]{43}` (prefixes in `packages/core/src/pat.ts`) — so a
  leaked instance token is caught. This guards the *repository*, a distinct surface from the
  *captured runtime content* in §2.

## 9. GitHub integration: untrusted webhooks, stored credentials, comment replies

The BYO GitHub App (issue #159) adds three surfaces with distinct threats:

**Webhook input is untrusted until the HMAC verifies.** `POST /api/github/webhook` reads
the raw body bytes first and verifies `X-Hub-Signature-256` (HMAC-SHA256 with the stored
webhook secret, constant-time compare) before any JSON parsing; failures get 401 and no
processing. Everything in a verified payload is still *GitHub-mediated user input*:
command parsing is strictly deterministic (`packages/core/src/github/command.ts` — no
inference over comment text), and reply templates never echo attacker-controlled input
beyond bounded, validated fragments.

**App credentials live in D1, encrypted at rest.** The Manifest conversion delivers the
App's private key, webhook secret, and OAuth client secret at runtime, so they cannot be
environment secrets. They are stored AES-256-GCM encrypted with a key derived (HKDF) from
`BETTER_AUTH_SECRET` — a database dump alone does not disclose them; the trust anchor
remains the environment secret, which is already fail-closed (§8). Secrets are never
returned by any API; only display metadata (slug, owner, App id) is readable.

**Comment replies must not make an OSS repo a spam surface, nor let outsiders probe.**
Commands execute only for identity-linked workspace members (the link is created via the
App's user-authorization OAuth flow — verified account ownership, keyed by the immutable
numeric GitHub user id, never the mutable login). Feedback replies (onboarding, errors)
go only to commenters whose `author_association` is OWNER/MEMBER/COLLABORATOR; everyone
else gets no reaction at all. Bot comments (including the App's own replies) never
trigger commands. The redirect flows (manifest setup, connect) are CSRF-bound by a
signed, purpose-scoped, expiring state that must match both the `state` query param and
an HttpOnly cookie. Client-sent git remote URLs may embed credentials
(`https://user:token@…`): they are normalized server-side (userinfo stripped) and never
persisted — only the matched `owner/repo` full name is stored.

## Related

- [`permissions.md`](./permissions.md) — who can read and write each resource (the access
  model).
- [`data-model.md`](./data-model.md) — the entities and how they relate.
- [`CLAUDE.md`](../CLAUDE.md) — architecture invariants, including the report-template
  rendering rules.
