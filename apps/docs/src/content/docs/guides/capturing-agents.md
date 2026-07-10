---
title: Capturing agent activity
description: Set up agent tokens and capture the sessions your AI agents run.
---

Spantail can capture what your AI agents do — coding sessions, tool calls, token
usage — and show it on the timeline next to human work. Activity is captured per
**session**: each session carries its own duration and token usage, and sessions
are grouped by agent.

:::note
Agent ingest must be enabled for the instance by an administrator. If you don't
see the Agents settings described below, ask your instance admin.
:::

## Register an agent

Open **Settings → Agents** (under Account) and create an agent. Each agent has:

- A **type** — Claude Code, Codex, Cursor, or Other.
- A **default workspace** — where its sessions land.
- **Associated projects** *(optional)* — for grouping its activity.

You can enable or disable an agent at any time.

:::note[Screenshot]
The Agents settings page: the agent list with type, default workspace, and the
enable/disable toggle.
🚧 Image to be added.
:::

## Get the agent token

Each agent has one **agent access token** — a write-only, **ingest-only**
credential. It can only send agent activity; it is **not** accepted for the
[CLI](/guides/tools/cli/), [MCP](/guides/tools/mcp/), or the rest of the API
(those use a [personal API token](/guides/account-preferences/) and act as you).
Copy the agent token when you register the agent and store it securely; it is
scoped to your workspace membership and is checked on every ingest.

## Send activity

Using the agent token, your agent posts its turns to the ingest endpoint
(`POST /api/v1/agent-events`), and Spantail rolls them up into sessions. For
Claude Code the easiest path is the dedicated **Claude Code plugin** — see
[Claude Plugin](/guides/tools/claude-plugin/) — which captures sessions
automatically. Other agents send activity programmatically through the
ingest API.

:::note[Screenshot]
The dashboard timeline with agent sessions interleaved with human entries.
🚧 Image to be added.
:::

## Review agent activity

Open an agent's activity page to see its sessions over a date range, with stats,
a per-project breakdown, and token usage. This is a read-only rollup — the raw
per-turn telemetry is not shown.

Click a session row — or select it with <kbd>J</kbd> / <kbd>K</kbd> and press
<kbd>O</kbd> — to open its details in a panel docked at the right edge: project,
date, and duration; a usage card with the event count, active time, and tokens,
the input/output split, and the per-bucket token breakdown; the repositories,
branches, and references the session touched; and the session id. Move through
sessions with <kbd>↑</kbd> / <kbd>↓</kbd> (or the panel's prev/next buttons)
without reopening, and press <kbd>Esc</kbd> to close.

:::note[Screenshot]
An agent activity page: stats, the session list, and token usage for the
selected range.
🚧 Image to be added.
:::
