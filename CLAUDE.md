# CLAUDE.md

Spantail is an open-source work observability platform on Cloudflare Workers + D1: log human
work and capture AI-agent activity as spans, then turn them into reports.
pnpm monorepo: a single Worker (`apps/web`) serves the REST API, the MCP endpoint, and the React SPA.

## Language rules

- Code, comments, commit messages, issues, and PRs: **English only**.
- This repository will become public. Never reference AIRS-internal systems, customers, or any
  non-public information in code, comments, commits, or issues.
- All user-facing UI strings go through i18n catalogs (`en`, `ja`). Never hardcode UI text.
  A feature is not done until both locales are provided.

## Commands

```bash
pnpm dev                # SPA + Worker dev server (Cloudflare Vite plugin, local D1)
pnpm test               # all tests (vitest, Workers pool)
pnpm test <pattern>     # single test file (pnpm forwards args; do not add --)
pnpm lint               # biome check (use `pnpm lint:fix` to autofix)
pnpm typecheck          # tsc across all packages
pnpm db:generate        # drizzle-kit generate (after editing packages/db/src/schema)
pnpm db:migrate:local   # apply migrations to local D1
pnpm db:migrate:remote  # apply migrations to remote D1
pnpm db:seed [name]     # seed local D1 from examples/<name>/db/seed (default: demo; see packages/db/seed)
pnpm generate-import [name] # write examples/<name>/import/work-entries.jsonl (gitignored) for `spantail entries import`
pnpm db:drop            # wipe local D1 state
pnpm db:reset           # db:drop → db:migrate:local (schema only, no seed; local only)
pnpm deploy             # wrangler deploy (apps/web)
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
- **Single source of truth for types.** Zod schemas in `packages/core` define entities and
  request/response shapes. Validate at the API boundary with them. Never redeclare these types.
- **Data access** goes through query functions in `packages/db`. No inline SQL or ad-hoc Drizzle
  calls in route handlers. Create one Drizzle instance per request and pass it down.
- **SPA data flow.** Server state only via TanStack Query + the typed API client — never raw
  `fetch`. UI state stays local; do not add a global state library. shadcn/ui components live in
  `src/client/components/ui` (generated; avoid hand-editing beyond theming).
- **App shell.** The root layout is based on the shadcn/ui Sidebar block `sidebar-07` (collapses
  to icons). The sidebar is workspace-scoped only: workspace switcher at the top, workspace
  navigation, and a single Settings cog pinned at the bottom that opens the Settings hub
  (`/settings`). Settings is one screen with a left sub-nav grouping every management section —
  Workspace (general, projects, members), Account (API tokens, password, preferences: language +
  theme + timezone), Reporting (report templates — instance-scoped, gated to instance admins and users with
  the template-author capability), and System (instance admin only: user management, email,
  social login) — each a deep-linkable child route (`/settings/<section>`).
  User-scoped surfaces — reports and the user menu (account, logout) — live in the header's
  top-right corner, never in the sidebar. New screens render inside this shell.
- **Dates and time.** Timezone is a per-user concept (`user.timezone`, null → UTC); workspaces and
  projects have none. A date and a timestamp are independent: `work_entries.entry_date` is a local
  date string (`YYYY-MM-DD`) in the author's timezone, frozen at write; all timestamps are UTC
  instants; durations are integer minutes. Daily aggregation groups by the stored `entry_date` (no
  timezone needed). `agent_entries` store only timestamps (no `entry_date`) — their calendar day is
  derived from `startedAt` in the viewer's timezone at read time. Reports resolve relative ranges and
  the generation date in the running user's timezone.
- **Permissions.** Every query is scoped by workspace membership. Cross-workspace report filters
  must be validated against the union of the user's workspaces. See
  [`docs/permissions.md`](docs/permissions.md) for the full role × resource access model (the
  single source of truth), and [`docs/data-model.md`](docs/data-model.md) for the entities and how
  they relate. See [`docs/security.md`](docs/security.md) for the Spantail-specific security threat
  model (untrusted ingest, sensitive captured content, capability-URL sharing, secure self-hosting
  defaults) and the invariants that protect it.
- **Docs stay in sync.** When you change the data model (`packages/db` schema or `packages/core`
  entities) or the permissions model, update the matching source-of-truth doc — `docs/data-model.md`
  or `docs/permissions.md` — in the same change, so the docs never drift from the code.
- **Report templates are instance-scoped formats.** A template is a presentation format,
  independent of any workspace, project, user, or period — a report freely combines any template
  with any scope and date range at run time. Templates are ordinary `report_templates` rows; there
  are no code-defined builtins. When the templates list is read and the instance has none — a fresh
  or an upgraded instance — a single default template (from `@spantail/templates`, in the request's
  `Accept-Language`) is lazily seeded so reports are always composable; the insert is idempotent
  (fixed id + `onConflictDoNothing`). Managing templates requires instance admin or the
  template-author capability (`user.canManageTemplates`), not a workspace role.
- **Report templates are user input.** LiquidJS rendering must keep the safety settings
  (own-property access only, strict filters, parse/render/memory limits, file tags disabled).
  Rendered Markdown must be displayed without raw-HTML passthrough.

## Conventions

- TypeScript strict mode everywhere. No `any` without a comment justifying it.
- Conventional Commits (`feat:`, `fix:`, `refactor:`, ...).
- Versioning and the release runbook live in [`docs/releasing.md`](docs/releasing.md) (SemVer,
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

## Definition of done

`pnpm typecheck && pnpm lint && pnpm test` pass; migrations generated if schema changed;
UI strings exist in `en` and `ja`; docs updated when public behavior changes.
