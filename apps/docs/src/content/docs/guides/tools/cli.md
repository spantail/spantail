---
title: CLI
description: The spantail command-line client.
---

`spantail` is the command-line client. It talks to the REST API of a running
Spantail instance, so it does the same things the web app does — log work, list
entries, read reports — from your terminal or scripts.

## Install

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
spantail report view <report-id> > weekly.md
```

| Command | Description |
|---|---|
| `spantail auth login` | Validate and save credentials (`--server`, `--token` for non-interactive use). |
| `spantail auth status` | Show the active connection and signed-in user. |
| `spantail auth logout` | Remove saved credentials (the token itself stays valid). |
| `spantail workspaces list` | List the workspaces you belong to. |
| `spantail projects list` | List the projects in a workspace. |
| `spantail log <description>` | Log a work entry (`--project`, `--duration`, `--date`, `--note`, `--tag`). |
| `spantail entries list` | List recent work entries (`--project`, `--from`, `--to`, `--limit`). |
| `spantail report list` | List your saved reports with their ids. |
| `spantail report view <id>` | Print a report's rendered Markdown to stdout (status to stderr). |
| `spantail mcp` | Run a stdio [MCP](/guides/tools/mcp/) server for AI clients. |

Run `spantail <command> --help` for the full options. Durations accept minutes
or hours/minutes forms: `90`, `90m`, `2h`, `1h30m`.

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
