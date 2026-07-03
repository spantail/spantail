---
title: MCP
description: Remote /mcp and stdio MCP servers for AI clients.
---

Spantail speaks the **Model Context Protocol (MCP)**, so AI clients can log and
manage work entries, search, and create and read reports against your instance
through their own tools. MCP is a client of the same REST API, so it respects
the same permissions as your token.

The tool set is deliberately smaller than the [CLI](/guides/tools/cli/):
operations with interpersonal side effects — sending reports, share links,
comments, the inbox — stay human-initiated.

## Two ways to connect

- **Remote endpoint** — your instance exposes `<instance>/mcp` over HTTP. Use
  this if your client supports remote MCP servers.
- **Stdio server** — run `spantail mcp` locally (from the [CLI](/guides/tools/cli/))
  for clients that only support stdio servers. It uses your saved CLI
  credentials.

## Authenticate

MCP authenticates with a **personal API token** (from
[Settings → API tokens](/guides/account-preferences/)), passed as a Bearer
token. The token acts as you, with your permissions.

Agent access tokens are **not** accepted here — they are ingest-only and can
only send agent activity, not call MCP tools. See
[Capturing agent activity](/guides/capturing-agents/).

## Set up with Claude Code

The stdio server registers in one line:

```bash
claude mcp add spantail -- spantail mcp
```

For a direct HTTP connection, point your client at `<instance>/mcp` with your
token as a Bearer credential instead.

## Available tools

| Tool | What it does |
|---|---|
| `list_workspaces` | List your workspaces (call first to resolve ids). |
| `list_projects` | List the projects in a workspace. |
| `log_work` | Create a work entry. |
| `list_entries` | List work entries, with optional filters. |
| `update_entry` | Update one of your work entries. |
| `delete_entry` | Delete one of your work entries. |
| `search` | Search your work entries and reports by text. |
| `list_report_templates` | List the instance's report templates. |
| `list_reports` | List your saved reports. |
| `get_report` | Fetch a report, including its rendered Markdown. |
| `preview_report` | Render a report from a template, scope, and period without saving it. |
| `create_report` | Create a report; adopts the template's suggested name when none is given. |
| `update_report` | Re-render an existing report with changed fields (new version). |
