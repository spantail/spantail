---
title: CLI
description: The spantail command-line client.
---

`spantail` is the command-line client. It talks to the REST API of a running
Spantail instance, so it does the same things the web app does — log and manage
work entries, create and send reports, share them, discuss them, and read your
inbox — from your terminal or scripts. Administration (users, workspaces,
projects, templates) stays in the web app.

## Install

:::caution[Not published yet]
The `spantail` CLI isn't on npm yet. The command below will work once it's
released; until then, build it from `packages/cli` in the
[monorepo](https://github.com/spantail/spantail).
:::

```bash
npm install -g spantail
```

Requires Node.js 24 or later.

## Sign in

1. In the web app, create an API token under **Settings → API tokens** (read and
   write scopes are enough). See [Account & preferences](/guides/account-preferences/).
2. Log in and pick a default workspace:

```bash
spantail auth login
# Server URL: https://spantail.example.com
# API token: (paste — input is hidden)
```

Credentials are saved to `~/.config/spantail/config.json` (mode `0600`).

## Common commands

```bash
spantail log "Fixed the build" --project website --duration 1h30m --tag ci
spantail entries list --from 2026-06-01 --to 2026-06-30
spantail report create --template <template-id> --range last-week
spantail report view <report-id> > weekly.md
spantail report send <report-id> --to teammate@example.com --message "FYI"
```

### Connection and lookup

| Command | Description |
|---|---|
| `spantail auth login` | Validate and save credentials (`--server`, `--token` for non-interactive use). |
| `spantail auth status` | Show the active connection and signed-in user. |
| `spantail auth logout` | Remove saved credentials (the token itself stays valid). |
| `spantail workspaces list` | List the workspaces you belong to. |
| `spantail projects list` | List the projects in a workspace. |
| `spantail search <query>` | Search your work entries and reports. |
| `spantail mcp` | Run a stdio [MCP](/guides/tools/mcp/) server for AI clients. |

### Work entries

| Command | Description |
|---|---|
| `spantail log <description>` | Log a work entry (`--project`, `--duration`, `--date`, `--note`, `--tag`). |
| `spantail entries list` | List recent work entries (`--project`, `--from`, `--to`, `--limit`). |
| `spantail entries view <id>` | Print one work entry in full. |
| `spantail entries edit <id>` | Update fields of one of your entries; only the passed flags change. |
| `spantail entries delete <id>` | Delete one of your entries (asks unless `--yes`). |
| `spantail entries stats` | Aggregated totals with by-date/project/user breakdowns. |
| `spantail entries tags` | List the distinct tags in scope, one per line. |
| `spantail entries import <file.jsonl>` | Bulk-import work entries from a JSONL file (`--workspace`, `--project`, `--dry-run`). |

#### Bulk import (JSONL)

`spantail entries import` migrates work entries from another system. The file
holds one JSON object per line:

```json
{"project":"website","entryDate":"2024-07-15","durationMinutes":90,"description":"Reviewed onboarding flow","tags":["review"]}
```

Fields per line: `entryDate` (required — dates are taken verbatim, no timezone
conversion), `durationMinutes`, `description`, and optional `project` (slug;
lines without one use `--project`), `note`, `tags`, `startedAt`, `endedAt`,
`externalId`.

The whole file is validated first — any bad line fails the run with its line
number before anything is sent. Entries are then posted in atomic batches of
100 (each request fully succeeds or fully fails). Use `--dry-run` to validate
and resolve project slugs without importing.

`externalId` is normally omitted. Set it to keep the source system's id: it
becomes the entry's id (unique across the instance; charset `A-Za-z0-9._:-`;
prefix weak ids, e.g. `legacy-123`), and re-importing the same file then
updates those entries instead of duplicating them. Lines without an
`externalId` duplicate when imported again.

### Reports

| Command | Description |
|---|---|
| `spantail report templates` | List the report templates and their ids. |
| `spantail report create` | Create a report from a template and filters (`--template`, `--range` or `--from`/`--to`, `--project`, `--user`, `--tag`). |
| `spantail report preview` | Render a report without saving it. |
| `spantail report list` | List your saved reports with their ids. |
| `spantail report view <id>` | Print a report's rendered Markdown to stdout (status to stderr). |
| `spantail report edit <id>` | Re-render with changed fields; omitted flags keep current values. |
| `spantail report delete <id>` | Delete a report (asks unless `--yes`). |

### Sending, sharing, and discussion

| Command | Description |
|---|---|
| `spantail report recipients <id>` | List a report's candidate recipients. |
| `spantail report send <id>` | Send a frozen snapshot to inboxes (`--to`, `--self`, `--message`). |
| `spantail report sends <id>` | Show the send history with read counts. |
| `spantail report share <id>` | Create a public share link (`--expires-in`, `--passcode`). |
| `spantail report shares <id>` | List a report's share links and their status. |
| `spantail report unshare <share-id>` | Revoke a share link. |
| `spantail report discussion <id>` | Show the reactions and comments on the report's current version. |
| `spantail report comment <id> <body>` | Add a comment (`--edit`/`--delete` for your own). |
| `spantail report react <id> <emoji>` | Toggle a reaction on the current version or a comment (`--comment`). |

### Inbox

| Command | Description |
|---|---|
| `spantail inbox list` | List a mailbox folder (`--folder inbox\|starred\|sent\|archive\|trash`). |
| `spantail inbox view <id>` | Print a received report snapshot (doesn't mark it read). |
| `spantail inbox counts` | Per-folder counts, including unread. |
| `spantail inbox read <id>` / `unread <id>` / `read-all` | Manage read state. |
| `spantail inbox flag <id>` | Star/archive/trash an item (`--sent` for sent batches). |

Run `spantail <command> --help` for the full options. Durations accept minutes
or hours/minutes forms: `90`, `90m`, `2h`, `1h30m`. Destructive commands ask
for confirmation; pass `--yes` in scripts.

## Configuration

Commands that need a workspace use `--workspace <slug>`, falling back to the
default chosen at login. Environment variables override the config file:

| Variable | Meaning |
|---|---|
| `SPANTAIL_API_URL` | Instance base URL. |
| `SPANTAIL_API_TOKEN` | API token. |
| `SPANTAIL_CONFIG_DIR` | Alternative config directory. |

## Use with AI clients

`spantail mcp` serves the Spantail tools over stdio for AI clients that don't
support remote MCP servers. See [MCP](/guides/tools/mcp/).
