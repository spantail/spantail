# spantail

Command-line client for [Spantail](https://github.com/spantail/spantail), the
open-source work logging and reporting platform. It talks to the REST API of
a running Spantail instance — self-hosted on Cloudflare Workers — so you need
one (or its URL) before the CLI is useful.

## Install

```bash
npm install -g spantail
```

Requires Node.js 24 or later.

## Quick start

1. In the Spantail web UI, create an API token under **Account → API tokens**
   (open the user menu in the top-right corner; read and write scopes
   recommended).
2. Log in and pick a default workspace:

```bash
spantail auth login
# Server URL: https://spantail.example.com
# API token: (paste, input is hidden)
```

3. Log work and look at it:

```bash
spantail log "Fixed the build" --project website --duration 1h30m --tag ci
spantail entries list
spantail report run <report-id> > weekly.md
```

## Commands

| Command | Description |
|---|---|
| `spantail auth login` | Validate and save credentials (`--server`, `--token` for non-interactive use) |
| `spantail auth status` | Show the active connection and signed-in user |
| `spantail auth logout` | Remove saved credentials (the token itself stays valid) |
| `spantail workspaces list` | List the workspaces you belong to |
| `spantail projects list` | List the projects in a workspace |
| `spantail log <description>` | Log a work entry (`--project`, `--duration`, `--date`, `--note`, `--tag`) |
| `spantail entries list` | List recent work entries (`--project`, `--from`, `--to`, `--limit`) |
| `spantail report list` | List your saved reports with their ids |
| `spantail report run <id>` | Run a report; the markdown goes to stdout, status info to stderr |
| `spantail mcp` | Run a stdio MCP server bridging AI clients to your instance |

Run `spantail <command> --help` for the full options. Durations accept minutes
or h/m forms: `90`, `90m`, `2h`, `1h30m`. Tables and rendered markdown go to
stdout; prompts, summaries, and errors go to stderr. Exit codes: `0` success,
`1` runtime error, `2` usage error.

## Configuration

`spantail auth login` writes `$XDG_CONFIG_HOME/spantail/config.json` (default
`~/.config/spantail/config.json`) with mode 0600. The file stores the API token
in plaintext — the same trust level as `~/.npmrc`. Prefer the interactive
prompt over `--token`, which lands in your shell history.

Environment variables override the config file per field:

| Variable | Meaning |
|---|---|
| `SPANTAIL_API_URL` | Instance base URL |
| `SPANTAIL_API_TOKEN` | API token |
| `SPANTAIL_CONFIG_DIR` | Alternative config directory |

Commands that need a workspace use `--workspace <slug>`, falling back to the
default chosen at login.

## MCP

`spantail mcp` serves the Spantail tools (log work, list entries, run reports, …)
over stdio for AI clients that do not support remote MCP servers. It uses the
same credentials as the other commands, so after `spantail auth login`:

```bash
claude mcp add spantail -- spantail mcp
```

Spantail instances also expose a remote MCP endpoint at `<instance>/mcp` if you
prefer a direct HTTP connection.

## License

MIT
