# Engineering conventions

The conventions, architecture invariants, and Definition of Done every change follows. Written
for humans and coding agents alike; [`CLAUDE.md`](../CLAUDE.md) imports this file so a Claude
Code session starts with it in context.

Spantail is an open-source work observability platform on Cloudflare Workers + D1: log human
work and capture AI-agent activity as agent sessions, then turn them into reports.
pnpm monorepo: a single Worker (`apps/web`) serves the REST API, the MCP endpoint, and the React SPA.

## Language rules

- Code, comments, commit messages, issues, and PRs: **English only**.
- This repository is public. Never reference internal systems, customers, or any non-public
  information in code, comments, commits, or issues.
- All user-facing UI strings go through i18n catalogs (`en`, `ja`). Never hardcode UI text.
  A feature is not done until both locales are provided.
- User-facing terminology — in the UI, the docs, and the marketing site — follows the glossary
  in [`apps/docs/src/content/docs/guides/index.md`](../apps/docs/src/content/docs/guides/index.md).
  It is the single source of truth for what a thing is called in `en` and `ja`. When you name a
  new concept, add it there first.

## Commands

```bash
pnpm dev                # SPA + Worker dev server (Cloudflare Vite plugin, local D1)
pnpm test               # all tests (vitest, Workers pool)
pnpm test <pattern>     # single test file (pnpm forwards args; do not add --)
pnpm lint               # biome check (use `pnpm lint:fix` to autofix)
pnpm typecheck          # tsc across all packages
pnpm quality            # dead code / unused deps (Knip) + architecture-boundary checks (dependency-cruiser)
pnpm db:generate        # drizzle-kit generate (after editing packages/db/src/schema)
pnpm db:migrate:local   # apply migrations to local D1
pnpm db:migrate:remote  # apply migrations to remote D1
pnpm db:seed [name]     # seed local D1 from examples/<name>/db/seed + upload examples/<name>/r2 to local R2 (default: demo)
pnpm db:seed:sql [name] # print a dataset's seed SQL to stdout/--out for a remote D1 (pure; touches no DB or R2)
pnpm generate-import [name] # write examples/<name>/import/work-entries.jsonl (gitignored) for `spantail entries import`
pnpm generate-avatars [name] # (re)generate examples/<name>/r2 avatar/logo assets (WebP)
pnpm db:drop            # wipe local D1 state
pnpm db:reset           # db:drop → db:migrate:local (schema only, no seed; local only)
pnpm run deploy         # wrangler deploy (apps/web); `run` is required — see docs/deploy.md
```

## Monorepo map

| Path | Role |
|---|---|
| `apps/web/src/server` | Hono routes (`/api/v1`), MCP handler (`/mcp`), share views. Keep handlers thin. |
| `apps/web/src/client` | React SPA. File-based routes in `src/client/routes` (TanStack Router). |
| `apps/docs` | Astro Starlight docs (en root + ja). |
| `packages/core` | Domain logic, Zod schemas, report engine. Runtime-agnostic — no Workers/DOM APIs. |
| `packages/db` | Drizzle schema, migrations, query functions. |
| `packages/sdk` | Typed API client (reuses core schemas). |
| `packages/templates` | Default report-template catalog (`.liquid` files). Worker reads via `?raw`; the seed via `/node` (fs). |
| `packages/cli` | `spantail` CLI + stdio MCP server. A thin client of the REST API. |
| `examples/<name>/db/seed` | Demo seed datasets (YAML) consumed by `pnpm db:seed <name>` (`demo`, `demo-ja`). |

## Architecture invariants

- **One API.** Web, CLI, and MCP are all clients of the same REST API. Business logic never
  lives in a client; it lives in `packages/core`. Route handlers: validate → call core/db → respond.
- **`/api/v1` grows by addition.** From `v1.0.0` on, endpoints and fields may be added but never
  removed or repurposed; a breaking change ships as `/api/v2` alongside. Until then (`0.x`) the API
  may still break — see [`releasing.md`](./releasing.md). This is what lets the CLI ship on its own
  release track: an older CLI keeps working against a newer server. Only the reverse can break,
  since the API rejects request fields it does not know, so the CLI declares the oldest server it is
  tested against (`MIN_SERVER_VERSION` in `packages/cli/src/version.ts`) and warns when it meets an
  older one. Raise it in the same change that starts depending on something newer.
- **Single source of truth for types.** Zod schemas in `packages/core` define entities and
  request/response shapes. Validate at the API boundary with them. Never redeclare these types.
- **Data access** goes through query functions in `packages/db`. No inline SQL or ad-hoc Drizzle
  calls in route handlers. Create one Drizzle instance per request and pass it down.
- **SPA data flow.** Server state only via TanStack Query + the typed API client — never raw
  `fetch`. UI state stays local; do not add a global state library. shadcn/ui components live in
  `src/client/components/ui` (generated; avoid hand-editing beyond theming).
- **App shell.** The root layout is based on the shadcn/ui Sidebar block `sidebar-07` (collapses
  to icons). The sidebar is workspace-scoped only: workspace switcher at the top, workspace
  navigation, and a single Settings cog pinned at the bottom that opens Settings.
  Settings (`/settings`) is a full-screen takeover, a sibling shell to `/reports` and `/messages`:
  its rail replaces the workspace navigation (title + Close back to the workspace) and groups every
  management section — Workspace (general, projects, members), Report (report templates —
  instance-scoped, gated to instance admins and users with the template-author capability),
  Account (preferences — profile photo, language, theme, timezone — plus authentication, API tokens, agents),
  and System (instance admin only: user management, features; About is public) — each a
  deep-linkable child route (`/settings/<section>`). The workspace-scoped sections carry a middle
  workspaces pane: the sections edit the workspace selected there (settings-local, defaulting to
  the active workspace), so admins can manage any workspace without switching the app.
  User-scoped surfaces — reports and the user menu (account, logout) — live in the header's
  top-right corner, never in the sidebar. New screens render inside this shell.
- **Dates and time.** Timezone is a per-user concept (`user.timezone`, null → UTC); workspaces and
  projects have none. A date and a timestamp are independent: `work_entries.entryDate` (SQL
  `entry_date`) is a local date string (`YYYY-MM-DD`) in the author's timezone, frozen at write; all
  timestamps are UTC instants; durations are integer minutes. Daily aggregation groups by the
  stored `entryDate` (no timezone needed). `agent_entries` store only timestamps (no `entryDate`) —
  their calendar day is derived from `startedAt` in the viewer's timezone at read time. Reports
  resolve relative ranges and the generation date in the running user's timezone.
- **Date/time display goes through the shared formatters** in `packages/core/src/datetime-format.ts`
  (`formatDay`, `formatDateRange`, `formatTimestamp`, `formatInstantDate`) — don't hand-format a date
  with `Date#toLocaleDateString`/`toLocaleString` in a component (formatting a *number* with
  `Number#toLocaleString`, and library-internal date rendering like the shadcn calendar, are fine).
  Pass `i18n.language` as the locale and the
  viewer's today (`useToday()`) as `now`. Policy: work and report dates — ones a user reasons about
  by day (entry dates, a report's period, a report's list date) — carry a weekday via `formatDay`;
  ranges (`formatDateRange`) and account/metadata timestamps — created/expiry/last-used, shown with a
  clock via `formatTimestamp` or as a bare day via `formatInstantDate` — do not. The year is shown
  only when the date is outside the viewer's current year (`year: "auto"`).
  Clock times (`formatClock`) are 24-hour in both locales; durations (`formatDuration`) stay
  locale-independent Latin `h`/`m`. Reports use the same core formatters via the Liquid `format_date`
  filter, whose optional argument (`'year'`/`'no-year'`) lets a template author force the year on or
  off; the shipped default templates pass `'year'`. The CLI prints raw ISO dates (a scripting surface).
- **Permissions.** Every query is scoped by workspace membership. Cross-workspace report filters
  must be validated against the union of the user's workspaces. See
  [`permissions.md`](./permissions.md) for the full role × resource access model (the
  canonical reference), and [`data-model.md`](./data-model.md) for the entities and how
  they relate. See [`security.md`](./security.md) for the Spantail-specific security threat
  model (untrusted ingest, sensitive captured content, capability-URL sharing, secure self-hosting
  defaults) and the invariants that protect it.
- **Docs stay in sync.** When you change the data model (`packages/db` schema or `packages/core`
  entities) or the permissions model, update the matching reference — `docs/data-model.md`
  or `docs/permissions.md` — in the same change, so the docs never drift from the code.
- **Report templates are instance-scoped formats.** A template is a presentation format,
  independent of any workspace, project, user, or period — a report freely combines any template
  with any scope and date range at run time. Templates are ordinary `report_templates` rows; there
  are no code-defined builtins. The starter catalog (Daily, Weekly, Monthly, from `@spantail/templates`)
  is seeded once at instance bootstrap — when the first user, the instance admin, signs up — in that
  request's `Accept-Language`, so reports are always composable; Daily is the instance default, and
  each starter carries a `defaultDateRange` that only pre-fills the compose dialog. The insert is
  idempotent (fixed ids + `onConflictDoNothing`). An instance later emptied of templates is not
  re-seeded; the first template created on it is promoted to default instead. Managing templates
  requires instance admin or the template-author capability (`user.canManageTemplates`), not a
  workspace role.
- **Report templates are user input.** LiquidJS rendering must keep the safety settings
  (own-property access only, strict filters, parse/render/memory limits, file tags disabled).
  Rendered Markdown must be displayed without raw-HTML passthrough.

## Conventions

- TypeScript strict mode everywhere. No `any` without a comment justifying it.
- Conventional Commits (`feat:`, `fix:`, `refactor:`, ...).
- Sign off every commit with `git commit -s` (`--signoff`, not the GPG `-S`), certifying the
  [`DCO`](../DCO). CI fails a PR carrying any unsigned commit; see
  [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the why and how to fix a missing trailer.
- Versioning and the release runbook live in [`releasing.md`](./releasing.md) (SemVer,
  `vX.Y.Z` tags → GitHub Releases). Docs (`apps/docs`) deploy on a separate lifecycle.
- YAGNI: prefer the simplest implementation; do not add dependencies, abstractions, or config
  options that current features don't need. DRY across packages — if web and CLI need the same
  logic, it belongs in `core` or `sdk`.
- Errors: API returns structured JSON errors (`{ error: { code, message } }`) with proper HTTP
  status; no stack traces in responses.
- Secrets only via `wrangler secret` / `.dev.vars` (gitignored). Never commit credentials;
  `wrangler.jsonc` may contain only non-secret IDs.

## Testing

- Unit tests colocated as `*.test.ts`; integration tests for routes run in the Workers pool
  (`@cloudflare/vitest-pool-workers`) against local D1.
- The report engine must keep golden tests: filters + fixture entries → expected Markdown.
- For manual checks in a browser, the `run-demo` skill
  ([`.claude/skills/run-demo/SKILL.md`](../.claude/skills/run-demo/SKILL.md)) is a convenient
  (optional) way to seed demo data and drive the app.

## Definition of done

`pnpm typecheck && pnpm lint && pnpm test && pnpm quality` pass; migrations generated if
schema changed; UI strings exist in `en` and `ja`; docs updated when public behavior changes.
