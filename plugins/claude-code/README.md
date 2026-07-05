# Spantail plugin for Claude Code

A [Claude Code](https://code.claude.com) plugin that captures your Claude Code
sessions as Spantail agent telemetry, and adds skills and agents for logging
work and building reports.

- **Hooks** (agent access token, zero extra dependencies beyond `bash`, `jq`,
  `curl`):
  - `Stop` posts each turn's compact telemetry to
    `POST /api/v1/agent-events` — token usage plus OTel-keyed attributes
    (git branch, repository URL, working directory, client version, request
    id). Conversation bodies never leave your machine.
  - `SessionEnd` re-posts the final events (idempotent reconcile) and
    finalizes the session via `POST /api/v1/agent-events/finalize` with the
    wall-clock end and the PRs the session touched (`pr-link` records →
    `context.refs`). The title of the session's plan file is sent as the
    entry description **only if you opt in**.
  - `SessionStart` exports `SPANTAIL_SESSION_ID` so the `/spantail:summary`
    toggle can target the current session.
- **Skills** (need the Spantail MCP connection, which acts as *you* via a
  personal API token — a separate credential from the hooks' agent token):
  - `/spantail:log-work` — log a work entry, or capture the current session's
    work.
  - `/spantail:create-report` — compose a report; always previews before
    saving.
  - `/spantail:summary on|off` — per-session toggle for sending the plan
    title as the entry description.
- **Agents**: `spantail-work-analyst` (work-entry retrospectives) and
  `spantail-agent-activity-analyst` (agent telemetry analysis).

Requires Claude Code v2.1.143 or later (plugin user config).

## Install

```
/plugin marketplace add spantail/spantail
/plugin install spantail@spantail
```

Enabling the plugin prompts for:

| Setting | Required | Meaning |
|---|---|---|
| `apiUrl` | yes | Your instance's base URL, e.g. `https://spantail.example.com`. |
| `agentToken` | yes | The **agent access token** from Settings → Agents (`spantail_aat_…`), a write-only ingest credential. |
| `workspaceId` | no | Defaults to the token's bound workspace. |
| `projectId` | no | Record sessions against a project. |
| `sendSessionSummary` | no | Send the session's summary title as the entry description (default off — see Privacy). |

Every setting can be overridden with an environment variable
(`SPANTAIL_API_URL`, `SPANTAIL_AGENT_TOKEN`, `SPANTAIL_WORKSPACE_ID`,
`SPANTAIL_PROJECT_ID`, `SPANTAIL_SEND_SESSION_SUMMARY`), e.g. in a
`settings.json` `env` block; the environment wins over the plugin config.

The skills and agents additionally need the Spantail MCP connection:

```bash
claude mcp add spantail -- spantail mcp   # stdio; needs the CLI + `spantail auth login`
```

or point Claude Code at your instance's remote `https://<instance>/mcp` with a
personal API token. The MCP server is deliberately not bundled with the
plugin: it authenticates as you (PAT) while the hooks authenticate as your
agent (AAT), and bundling it would break for hook-only users without the CLI.

## Privacy

The hooks send **compact telemetry only** — token counts, timestamps, model
names, git branch/repository, working directory, client version, request ids,
and PR references. Conversation bodies, thinking, and tool input/output never
leave your machine.

The one opt-in exception is `sendSessionSummary`: with the setting (or
`/spantail:summary on`) enabled, the SessionEnd hook extracts the session's
plan-file title — mechanically, from the transcript's structured plan-mode
records, with no extra inference — and stores it as the entry's description.
Sessions that never used plan mode send nothing (the description is
nullable). Anything placed in a description is stored verbatim and can
surface in reports, public share links, and Send-to deliveries — see
[`docs/security.md`](../../docs/security.md) (§2). The same applies to
whatever you put into descriptions via `/spantail:log-work`.

## Files

| File | Purpose |
|---|---|
| `hooks/hooks.json` | Wires SessionStart / Stop / SessionEnd. |
| `hooks/spantail-agent-stop.sh` | Stop hook: transcript → per-turn events ingest. |
| `hooks/spantail-session-end.sh` | SessionEnd hook: final reconcile + finalize. |
| `hooks/spantail-session-start.sh` | Exports the session id for the summary toggle. |
| `hooks/lib/config.sh` | Env → plugin user-config resolution. |
| `hooks/transcript-to-events.jq` | Transcript → compact events (deduped by `message.id`). |
| `hooks/transcript-to-finalize.jq` | Transcript → finalize body (endedAt, refs, opt-in plan title). |
| `hooks/transcript-to-plan-path.jq` | Transcript → the session's plan-file path (structured records only). |
| `skills/`, `agents/` | The skills and agents listed above. |

The hooks never fail a turn or block a session's end: on any missing
prerequisite or error they log to stderr and exit 0. Ingest is idempotent on
the server (`(agent, message.id)`), so re-posting is always safe and the
hooks keep no local state or cursors.

## Manual wiring (without the plugin)

The hook scripts also run standalone. Set the `SPANTAIL_*` environment
variables and register the scripts directly in your Claude Code
`settings.json`:

```jsonc
{
	"env": {
		"SPANTAIL_API_URL": "https://spantail.example.com",
		"SPANTAIL_AGENT_TOKEN": "spantail_aat_…"
	},
	"hooks": {
		"Stop": [
			{ "hooks": [{ "type": "command", "command": "/abs/path/hooks/spantail-agent-stop.sh" }] }
		],
		"SessionEnd": [
			{ "hooks": [{ "type": "command", "command": "/abs/path/hooks/spantail-session-end.sh" }] }
		]
	}
}
```

## Tests

```bash
bash hooks/transcript-to-events.test.sh
bash hooks/transcript-to-finalize.test.sh
```

Fixture-driven jq tests; they run in CI and skip cleanly where `jq` is
missing. The server-side integration tests remain the authoritative
correctness net for ingest semantics.
