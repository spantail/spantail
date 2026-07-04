---
title: Claude Plugin
description: Capture Claude Code sessions and work with Spantail from Claude Code.
---

The **Spantail plugin for Claude Code** captures your Claude Code sessions as
[agent activity](/guides/capturing-agents/) automatically, and adds skills and
agents for logging work and building reports from inside Claude Code.

Requires Claude Code v2.1.143 or later.

## Install

```
/plugin marketplace add spantail/spantail
/plugin install spantail@spantail
```

Enabling the plugin prompts for your instance URL and an **agent access
token** ([register an agent](/guides/capturing-agents/) first), plus optional
workspace and project ids. Each setting can be overridden with an environment
variable (`SPANTAIL_API_URL`, `SPANTAIL_AGENT_TOKEN`, `SPANTAIL_WORKSPACE_ID`,
`SPANTAIL_PROJECT_ID`, `SPANTAIL_SEND_SESSION_SUMMARY`) — the environment wins.

The hooks need `bash`, `jq`, and `curl` on `PATH`. They never fail a turn or
block a session from ending: on any problem they log to stderr and skip.

## What gets sent

The plugin's hooks send **compact telemetry only** — conversation bodies,
thinking, and tool input/output never leave your machine:

- On every **Stop** (end of a turn): per-turn token usage, timestamps, and
  model names, plus the git branch, repository URL, working directory, Claude
  Code version, and provider request ids as
  [event attributes](/api/agent-ingest/).
- On **SessionEnd**: a final idempotent re-post of the events, then a
  [finalize](/api/agent-ingest/#finalize-a-session) with the wall-clock end
  and the pull requests the session touched (as `context.refs`).

One thing is opt-in: with the `sendSessionSummary` setting (or
`/spantail:summary on` for a single session), the SessionEnd hook also sends
Claude Code's generated session summary title as the entry's description.
The title is derived from conversation content and, like any description, is
stored verbatim and can appear in reports and share links — it stays off
unless you turn it on.

## Skills and agents

| What | Purpose |
|---|---|
| `/spantail:log-work` | Log a work entry — from your words or from the current session's work. |
| `/spantail:create-report` | Compose a report; always previews before saving. |
| `/spantail:summary on\|off` | Per-session toggle for sending the session summary title. |
| `spantail-work-analyst` (agent) | Retrospectives over your work entries. |
| `spantail-agent-activity-analyst` (agent) | Analysis of your agents' session telemetry. |

The skills and analysis agents act **as you** and therefore need the
[Spantail MCP connection](/guides/tools/mcp/) with a personal API token — a
separate credential from the hooks' write-only agent token:

```bash
claude mcp add spantail -- spantail mcp
```

The MCP server is intentionally not bundled with the plugin, so hook-only
users don't need the CLI installed.

## Without the plugin

The hook scripts also run standalone with manually wired `settings.json`
hooks and `SPANTAIL_*` environment variables — see the
[plugin README](https://github.com/spantail/spantail/tree/main/plugins/claude-code)
for the copy-and-adapt instructions, or send telemetry programmatically via
the [ingest API](/api/agent-ingest/).
