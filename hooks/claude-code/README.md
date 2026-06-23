# Claude Code → Toxil agent telemetry

A reference [Claude Code](https://code.claude.com) **Stop hook** that records each
turn's token usage and timing into Toxil. It parses the transcript locally with
`jq` and sends only compact telemetry — conversation bodies never leave your
machine.

> This is a copy-and-adapt reference. It will later be packaged as a Claude Code
> plugin together with the Toxil skills; for now, wire it manually.

## Files

| File | Purpose |
|---|---|
| `toxil-agent-stop.sh` | The Stop hook entry point (reads the hook payload, posts events). |
| `transcript-to-events.jq` | Maps a transcript (JSONL) to the compact `agent-events` payload, deduped by `message.id`. |
| `transcript-to-events.test.sh` | Runs the jq filter against a committed fixture. |

## Requirements

`bash`, `jq`, and `curl` on `PATH`. The hook never fails a turn: on any missing
prerequisite or error it logs to stderr and exits 0.

## Setup

1. Register a Claude Code agent in Toxil and copy its **agent access token**.
2. Add the hook to your Claude Code `settings.json` (user-level
   `~/.claude/settings.json`, or project-level `.claude/settings.json`):

```jsonc
{
  "env": {
    "TOXIL_API_URL": "https://toxil.example.com",
    "TOXIL_AGENT_TOKEN": "tk_agt_…"
    // "TOXIL_WORKSPACE_ID": "…", // optional; defaults to the token's binding
    // "TOXIL_PROJECT_ID": "…"    // optional
  },
  "hooks": {
    "Stop": [
      { "hooks": [
        { "type": "command",
          "command": "/abs/path/to/hooks/claude-code/toxil-agent-stop.sh" }
      ] }
    ],
    "SessionEnd": [
      { "hooks": [
        { "type": "command",
          "command": "/abs/path/to/hooks/claude-code/toxil-agent-stop.sh" }
      ] }
    ]
  }
}
```

The `SessionEnd` entry is an optional final reconcile. Re-posting is free: the
ingest is idempotent on `(agent, message.id)`.
