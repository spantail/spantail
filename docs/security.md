# Security threat model

This is the single source of truth for the **security properties and standing threats
specific to Spantail** — the ones that fall out of what Spantail *is* (a self-hostable,
open-source work-observability platform that captures AI-agent activity) rather than from
generic web or supply-chain concerns. It records the invariants contributors must preserve
and the trade-offs that are deliberate, so neither is mistaken for a bug.

It is a companion to [`permissions.md`](./permissions.md) (who may read and write each
resource) and [`data-model.md`](./data-model.md) (the entities and how they relate); the
architecture invariants in [`CLAUDE.md`](../CLAUDE.md) come first. Where a rule already
lives in one of those, this doc summarizes and links rather than restating it.

The REST API at `/api/v1` (and the MCP endpoint) is the only enforcement point. The Web
SPA, CLI, and MCP are all clients of that API — **never trust the client**; every property
below is enforced server-side, in `packages/core` / `packages/db`.

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

A token is write-only ingest, scoped to its owner's workspace membership, re-checked live
at ingest time — but that only governs *where* it may write, not *what* it may write. The
bounds above are what protect the data itself.

## 2. Captured agent activity may contain sensitive content

Spantail records AI-agent activity verbatim and human work as free text, so span
descriptions, notes, and event payloads can contain **secrets, source-code fragments, or
PII** — an agent may paste an API key into a description without anyone intending it.

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
- Only the intended snapshot body is exposed — the machine-readable front-matter
  (filters, ids, provenance) is stripped before a share is rendered.

Send-to deliveries enforce an ACL computed from the report's **frozen** snapshot
(`snapshotProjectIds`): a recipient must be able to read every project in the snapshot, and
the check runs again at send time against that frozen set, so there is no live/stored
drift. See [`permissions.md`](./permissions.md) for the full matrix.

## 5. Snapshots are point-in-time and intentionally not re-filtered

A report snapshot captures exactly what its author could see when it was generated.
Persisted content (`GET /api/v1/reports/:id`, the inbox, public `/share/:token`) is **not
re-filtered on later reads** — see [`permissions.md`](./permissions.md). The deliberate
consequence: someone who loses access to a project or workspace can still view a snapshot
(or a share/delivery) produced while they had access.

This is a usability-vs-exposure trade-off, not a leak: a saved link must not break
unpredictably, and the stored snapshot is disconnected from live access control.
Contributors must not "fix" it by re-filtering stored content, and operators should know to
**revoke existing shares** when membership changes if the historical content is sensitive.
(Creating *new* shares after access loss is correctly blocked; revoking is still allowed.)

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

## Related

- [`permissions.md`](./permissions.md) — who can read and write each resource (the access
  model).
- [`data-model.md`](./data-model.md) — the entities and how they relate.
- [`CLAUDE.md`](../CLAUDE.md) — architecture invariants, including the report-template
  rendering rules.
