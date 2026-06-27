---
title: MCP
description: Remote /mcp and stdio MCP servers for AI clients.
---

Spantail speaks the **Model Context Protocol (MCP)**, so AI clients can log work,
list entries, and run reports against your instance through their own tools. MCP
is a client of the same REST API, so it respects the same permissions as your
token.

## Two ways to connect

- **Remote endpoint** — your instance exposes `<instance>/mcp` over HTTP. Use
  this if your client supports remote MCP servers.
- **Stdio server** — run `spantail mcp` locally (from the [CLI](/guides/tools/cli/))
  for clients that only support stdio servers. It uses your saved CLI
  credentials.

## Authenticate

MCP uses a **Bearer token**:

- A **personal API token** (from [Settings → API tokens](/guides/account-preferences/))
  acts as you.
- An **agent access token** is used when an AI agent reports its own activity —
  see [Capturing agent activity](/guides/capturing-agents/).

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
| `list_report_templates` | List the instance's report templates. |
| `list_reports` | List your saved reports. |
| `get_report` | Fetch a report, including its rendered Markdown. |
| `update_entry` | Update one of your work entries. |
