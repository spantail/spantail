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
  - `SessionStart` exports `SPANTAIL_SESSION_ID` and `SPANTAIL_PLUGIN_DATA`
    so the `/spantail:summary` toggle can target the current session, plus
    presence markers (never values) for the keychain-stored tokens so
    `/spantail:doctor` — a Bash tool call that cannot read the keychain —
    can report them accurately.
- **Skills** (use the bundled Spantail MCP server, which acts as *you* via a
  personal API token — a separate credential from the hooks' agent token; set
  `apiToken` to enable it):
  - `/spantail:log-work` — log a work entry, or capture the current session's
    work; the session you run it from is linked to the entry automatically.
    The `#N` form (`/spantail:log-work #123 2h yesterday`) logs against
    a GitHub issue: the server resolves the project from its repo→project
    mapping (configured in Settings → Integrations; no project id lives in
    this plugin) and links matching agent sessions. Duration/date are parsed
    server-side — the plugin sends your raw arguments verbatim.
  - `/spantail:create-report` — compose a report; always previews before
    saving.
  - `/spantail:summary on|off` — per-session toggle for sending the plan
    title as the entry description.
- **Attribution skills** (no MCP needed):
  - `/spantail:link` — link the current repository to a workspace and
    project (see [Per-repository attribution](#per-repository-attribution)).
  - `/spantail:doctor` — show where every config value resolves from and
    what to fix.
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
| `apiToken` | no | A **personal API token** (`spantail_pat_…`) for the bundled MCP server the skills and agents use — acts as you, separate from the agent token. Leave blank if you only use the hooks. |
| `sendSessionSummary` | no | Send the plan-file title as the entry description when a plan-mode session ends (default off — see Privacy). |

Claude Code stores this config **per plugin, user-globally** — every
repository shares it, whatever install scope you pick, and the dialog only
appears while no config exists yet. That is why the workspace and project
are *not* part of it: which workspace/project a session belongs to is a
per-repository question, answered by `/spantail:link` below.

Every setting can be overridden with an environment variable
(`SPANTAIL_API_URL`, `SPANTAIL_AGENT_TOKEN`, `SPANTAIL_SEND_SESSION_SUMMARY`,
and for attribution `SPANTAIL_WORKSPACE_ID` / `SPANTAIL_PROJECT_ID`), e.g. in
a `settings.json` `env` block; the environment wins over everything else.
These overrides feed the **hooks** only — the bundled MCP server always reads
the plugin's `apiUrl` and `apiToken` config, so if you point the hooks at a
different instance via `SPANTAIL_API_URL`, set the matching `apiUrl` (and
`apiToken`) in the plugin config too, or the skills and agents will act
against the plugin-configured instance instead.

## Per-repository attribution

Which workspace and project a repository's sessions are recorded against
lives in the repository, not in the user-global plugin config. The hooks
read two files at the repository root (`$CLAUDE_PROJECT_DIR`):

| File | Tracked | For |
|---|---|---|
| `.spantail/config.local.json` | gitignored | You only — `/spantail:link` writes it and reminds you to ignore it (`.gitignore` or `.git/info/exclude`) if it isn't yet. When present it replaces the shared file entirely (delete it to return to the team link). |
| `.spantail/config.json` | committed | The whole team — `/spantail:link --shared` writes it; commit it once and every collaborator who installs the plugin inherits it. |

Both may contain only `workspaceId` and `projectId`:

```json
{ "workspaceId": "<id>", "projectId": "<id>" }
```

Resolution order per value: `SPANTAIL_*` environment → the local file (or
the shared file when no local file exists) → plugin config → Claude Code's
global `pluginConfigs`. Ownership is file-level, never a per-key merge: a
linked repository (any parseable `.spantail` file) skips the two
user-global layers for both keys, and a local file replaces the shared one
entirely — so a workspace-only link never inherits a project id from the
shared file or from a stale global config. The repo files
are deliberately capped at those two keys — a cloned repository is untrusted
input, so `apiUrl` and tokens never resolve from it (a committed config could
otherwise redirect your telemetry, agent token included, to an arbitrary
server; see [`docs/security.md`](../../docs/security.md) §1).

How this maps to the plugin install scopes:

- **User scope** (install once, all repos): run `/spantail:link` in each
  repository you want attributed. An unlinked repository sends no workspace,
  so the server rejects its sessions instead of misattributing them —
  `/spantail:doctor` shows any repo you forgot to link. (To route every
  unlinked repository to one workspace anyway, set `SPANTAIL_WORKSPACE_ID`
  user-globally.)
- **Project scope** (team install): one member runs `/spantail:link --shared`
  and commits `.spantail/config.json`; everyone else just installs.
- **Local scope** (this repo, you only): run `/spantail:link` right after
  installing.

`/spantail:doctor` prints the effective value and source layer for every
setting, plus warnings (unlinked repository, ignored keys in `.spantail/`
files, missing credentials).

Installs configured before v0.3.0, when the plugin dialog still asked for a
workspace and project id, keep working: those user-global values remain the
final fallback in repositories without a `.spantail` file, and environment
variables override everything. The server itself has no fallback — the agent
token carries no default workspace — so a session that reaches it without a
workspace id is rejected.

The skills and agents use the Spantail MCP connection, which the plugin
bundles. With `apiToken` set, the plugin registers an HTTP MCP server
(`.mcp.json`) pointing at your instance's `<apiUrl>/mcp` and authenticating as
you. It uses your personal API token (PAT) — a different credential from the
hooks' agent token (AAT) — so it is a separate, optional setting: hook-only
users can leave `apiToken` blank, in which case the MCP server simply doesn't
authenticate (it lists as unavailable in `/mcp`) and the hooks are unaffected.
No CLI is required. `apiUrl` is joined to `/mcp` directly. Both tokens are
stored as sensitive plugin config (the system keychain).

To use the MCP outside this plugin instead — for example from another client —
register it manually:

```bash
claude mcp add spantail -- spantail mcp   # stdio; needs the CLI + `spantail auth login`
```

or point the client at your instance's remote `https://<instance>/mcp` with a
personal API token as the Bearer credential.

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
| `.mcp.json` | Registers the bundled HTTP MCP server (`<apiUrl>/mcp`, PAT auth) for the skills and agents. |
| `hooks/hooks.json` | Wires SessionStart / Stop / SessionEnd. |
| `hooks/spantail-agent-stop.sh` | Stop hook: transcript → per-turn events ingest. |
| `hooks/spantail-session-end.sh` | SessionEnd hook: final reconcile + finalize. |
| `hooks/spantail-session-start.sh` | Exports the session id for the summary toggle and token-presence markers for the doctor. |
| `hooks/spantail-doctor.sh` | Resolution report for `/spantail:doctor` (values, sources, warnings; credentials masked). |
| `hooks/lib/config.sh` | Env → repo `.spantail/` files → plugin user-config resolution. |
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
bash hooks/config.test.sh
```

Fixture-driven shell tests; they run in CI and skip cleanly where `jq` is
missing. The server-side integration tests remain the authoritative
correctness net for ingest semantics.
