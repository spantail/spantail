# toxil

Command-line client for [Toxil](https://github.com/airs/toxil), the
open-source work logging and reporting platform. It talks to the REST API of
a running Toxil instance — self-hosted on Cloudflare Workers — so you need
one (or its URL) before the CLI is useful.

## Install

```bash
npm install -g toxil
```

Requires Node.js 24 or later.

## Quick start

1. In the Toxil web UI, create an API token under **Account → API tokens**
   (open the user menu in the top-right corner; read and write scopes
   recommended).
2. Log in and pick a default workspace:

```bash
toxil auth login
# Server URL: https://toxil.example.com
# API token: (paste, input is hidden)
```

3. Log work and look at it:

```bash
toxil log "Fixed the build" --project website --duration 1h30m --tag ci
toxil entries list
toxil report run <report-id> > weekly.md
```

## Commands

| Command | Description |
|---|---|
| `toxil auth login` | Validate and save credentials (`--server`, `--token` for non-interactive use) |
| `toxil auth status` | Show the active connection and signed-in user |
| `toxil auth logout` | Remove saved credentials (the token itself stays valid) |
| `toxil workspaces list` | List the workspaces you belong to |
| `toxil projects list` | List the projects in a workspace |
| `toxil log <description>` | Log a work entry (`--project`, `--duration`, `--date`, `--note`, `--tag`) |
| `toxil entries list` | List recent work entries (`--project`, `--from`, `--to`, `--limit`) |
| `toxil report list` | List your saved reports with their ids |
| `toxil report run <id>` | Run a report; the markdown goes to stdout, status info to stderr |
| `toxil mcp` | Run a stdio MCP server bridging AI clients to your instance |

Run `toxil <command> --help` for the full options. Durations accept minutes
or h/m forms: `90`, `90m`, `2h`, `1h30m`. Tables and rendered markdown go to
stdout; prompts, summaries, and errors go to stderr. Exit codes: `0` success,
`1` runtime error, `2` usage error.

## Configuration

`toxil auth login` writes `$XDG_CONFIG_HOME/toxil/config.json` (default
`~/.config/toxil/config.json`) with mode 0600. The file stores the API token
in plaintext — the same trust level as `~/.npmrc`. Prefer the interactive
prompt over `--token`, which lands in your shell history.

Environment variables override the config file per field:

| Variable | Meaning |
|---|---|
| `TOXIL_API_URL` | Instance base URL |
| `TOXIL_API_TOKEN` | API token |
| `TOXIL_CONFIG_DIR` | Alternative config directory |

Commands that need a workspace use `--workspace <slug>`, falling back to the
default chosen at login.

## MCP

`toxil mcp` serves the Toxil tools (log work, list entries, run reports, …)
over stdio for AI clients that do not support remote MCP servers. It uses the
same credentials as the other commands, so after `toxil auth login`:

```bash
claude mcp add toxil -- toxil mcp
```

Toxil instances also expose a remote MCP endpoint at `<instance>/mcp` if you
prefer a direct HTTP connection.

## License

MIT
