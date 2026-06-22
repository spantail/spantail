# Toxil

> Know where your time goes.

Toxil is an open-source work logging and reporting platform. Log your work, then turn it into any report you need — daily reports, weekly summaries, monthly rollups — from a single source of truth, using Markdown templates. Built AI-first: every operation is available to humans (web, CLI) and AI agents (MCP) through the same API.

The name comes from the Japanese *toki* (時, time) + *shiru* (知る, to know).

> **Status**: Early development. APIs and schemas are unstable. Not yet ready for production use.

## Features

- **Workspaces** — organize work by department, team, or client organization. Projects live under workspaces. One deployment serves one company; this is not a multi-tenant SaaS.
- **Work entries** — date, duration, description, and tags, with optional start/end times. Designed for fast daily logging.
- **Unified reports** — no hardcoded report types. A report is a Markdown + Liquid template applied to filters you choose freely: any combination of workspaces, projects, users, and date range — including across workspaces. Built-in templates cover daily, weekly, and monthly reports.
- **Safe report sharing** — share an immutable report snapshot via an expiring, revocable link with an optional passcode. Viewers don't need an account — share with clients, stakeholders, or anyone outside your instance.
- **AI-first** — a built-in MCP server (remote Streamable HTTP, or local stdio via the CLI) and a CLI let AI agents and scripts log work and generate reports through the same API the web UI uses.
- **English / Japanese** — fully localized UI and documentation.

## Architecture

Toxil runs entirely on Cloudflare:

- **Workers** — a single Worker serves the REST API (`/api/v1`), the MCP endpoint (`/mcp`), shared report views, and the SPA static assets
- **D1** — primary database
- **R2** — report exports and artifacts

Backend is [Hono](https://hono.dev) with [Drizzle](https://orm.drizzle.team) and [Better Auth](https://better-auth.com). Frontend is a React SPA built with Vite, TanStack Router/Query, and shadcn/ui.

## Monorepo

| Path | Description |
|---|---|
| `apps/web` | Main application (Worker: API + MCP + SPA) |
| `apps/docs` | Documentation site (Astro Starlight, en/ja) |
| `packages/core` | Domain logic, Zod schemas, report engine |
| `packages/db` | Drizzle schema, migrations, queries |
| `packages/sdk` | Typed API client |
| `packages/cli` | `toxil` CLI (includes `toxil mcp` stdio server) |

## Getting started

Prerequisites: Node.js 24+, pnpm 10+, a Cloudflare account, and `wrangler` v4.

```bash
git clone https://github.com/toxildev/toxil.git
cd toxil
pnpm install

# create local env vars
cp apps/web/.dev.vars.example apps/web/.dev.vars

# apply migrations to the local D1 emulator and start the dev server
pnpm db:migrate:local
pnpm dev
```

`pnpm dev` runs the SPA and the Worker together on the Cloudflare Vite plugin, with local emulation of D1 and R2.

## Self-hosting

Toxil is designed to be deployed to your own Cloudflare account:

```bash
wrangler d1 create toxil-db
wrangler r2 bucket create toxil-exports
# set the generated IDs in apps/web/wrangler.jsonc, then:
pnpm db:migrate:remote
pnpm deploy
```

See the documentation at [toxil.dev](https://toxil.dev) for the full self-hosting guide, including required secrets and cost notes.

## CLI & MCP

```bash
toxil auth login                                  # store an API token
toxil log "Implemented report engine" --project core --duration 2h
toxil entries list --from 2026-06-01
toxil report run monthly --workspace acme --month 2026-06
toxil mcp                                         # stdio MCP server for AI clients
```

AI clients that support remote MCP can connect directly to `https://your-instance/mcp` with an API token.

## Development

```bash
pnpm dev          # dev server (SPA + Worker + local D1/R2)
pnpm test         # vitest (Workers pool)
pnpm lint         # biome
pnpm typecheck    # tsc across all packages
```

See [CLAUDE.md](./CLAUDE.md) for repository conventions.

## License

[MIT](./LICENSE)
