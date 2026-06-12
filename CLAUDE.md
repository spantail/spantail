# CLAUDE.md

Toxil is an open-source work logging and reporting platform on Cloudflare Workers + D1 + R2.
pnpm monorepo: a single Worker (`apps/web`) serves the REST API, the MCP endpoint, and the React SPA.

## Language rules

- Code, comments, commit messages, issues, and PRs: **English only**.
- This repository will become public. Never reference AIRS-internal systems, customers, or any
  non-public information in code, comments, commits, or issues.
- All user-facing UI strings go through i18n catalogs (`en`, `ja`). Never hardcode UI text.
  A feature is not done until both locales are provided.

## Commands

```bash
pnpm dev                # SPA + Worker dev server (Cloudflare Vite plugin, local D1/R2)
pnpm test               # all tests (vitest, Workers pool)
pnpm test <pattern>     # single test file (pnpm forwards args; do not add --)
pnpm lint               # biome check (use `pnpm lint:fix` to autofix)
pnpm typecheck          # tsc across all packages
pnpm db:generate        # drizzle-kit generate (after editing packages/db/src/schema)
pnpm db:migrate:local   # apply migrations to local D1
pnpm db:migrate:remote  # apply migrations to remote D1
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
| `packages/cli` | `toxil` CLI + stdio MCP server. A thin client of the REST API. |

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
  navigation, and a management group (templates, workspace settings) pinned at the bottom.
  User-scoped surfaces — reports and the user menu (account, language, logout) — live in the
  header's top-right corner, never in the sidebar. New screens render inside this shell.
- **Dates and time.** `work_entries.entry_date` is a local date string (`YYYY-MM-DD`) in the
  workspace's timezone. All timestamps are UTC. Durations are integer minutes.
- **Permissions.** Every query is scoped by workspace membership. Cross-workspace report scopes
  must be validated against the union of the user's workspaces.
- **Report templates are user input.** LiquidJS rendering must keep the safety settings
  (own-property access only, strict filters, parse/render/memory limits, file tags disabled).
  Rendered Markdown must be displayed without raw-HTML passthrough.

## Conventions

- TypeScript strict mode everywhere. No `any` without a comment justifying it.
- Conventional Commits (`feat:`, `fix:`, `refactor:`, ...).
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
- The report engine must keep golden tests: scope + fixture entries → expected Markdown.

## Definition of done

`pnpm typecheck && pnpm lint && pnpm test` pass; migrations generated if schema changed;
UI strings exist in `en` and `ja`; docs updated when public behavior changes.
