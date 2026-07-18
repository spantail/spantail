#!/usr/bin/env bash
#
# Claude Code "Stop" hook → Spantail agent-events ingest.
#
# Reads the hook payload (JSON on stdin), extracts per-assistant-message token
# usage and non-usage attributes from the transcript with jq (conversation
# bodies never leave this machine), and POSTs the compact events to Spantail.
# Idempotent on (agent, message.id), so it is safe to run on every Stop.
# Never fails the turn: any problem logs to stderr and exits 0.
#
# Requirements: bash, jq, curl.
# Configuration, each resolved as the SPANTAIL_* env var first, then the
# plugin's user config (see lib/config.sh):
#   SPANTAIL_API_URL        / apiUrl        Base URL, e.g. https://spantail.example.com
#   SPANTAIL_AGENT_TOKEN    / agentToken    Agent access token (write-only ingest credential)
#   SPANTAIL_WORKSPACE_ID   / workspaceId   Required by the server; resolved from the repo link
#   SPANTAIL_PROJECT_ID     / projectId     Optional; records the work against a project
set -u

skip() {
	printf 'spantail-agent-stop: %s\n' "$1" >&2
	exit 0
}

command -v jq >/dev/null 2>&1 || skip "jq not found; skipping"
command -v curl >/dev/null 2>&1 || skip "curl not found; skipping"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/config.sh
. "$here/lib/config.sh"
spantail_load_user_config
SPANTAIL_API_URL="$(spantail_config SPANTAIL_API_URL apiUrl)"
SPANTAIL_AGENT_TOKEN="$(spantail_config SPANTAIL_AGENT_TOKEN agentToken)"
SPANTAIL_WORKSPACE_ID="$(spantail_config SPANTAIL_WORKSPACE_ID workspaceId)"
SPANTAIL_PROJECT_ID="$(spantail_config SPANTAIL_PROJECT_ID projectId)"
[ -n "$SPANTAIL_API_URL" ] || skip "SPANTAIL_API_URL not configured; skipping"
[ -n "$SPANTAIL_AGENT_TOKEN" ] || skip "SPANTAIL_AGENT_TOKEN not configured; skipping"

hook_payload="$(cat)"
transcript="$(jq -r '.transcript_path // empty' <<<"$hook_payload")"
session="$(jq -r '.session_id // empty' <<<"$hook_payload")"
cwd="$(jq -r '.cwd // empty' <<<"$hook_payload")"
[ -n "$transcript" ] || skip "no transcript_path in hook payload; skipping"
[ -f "$transcript" ] || skip "transcript not found: $transcript; skipping"
[ -n "$session" ] || skip "no session_id in hook payload; skipping"

# The repository URL is the one attribute the transcript doesn't carry; read
# it once from the local git config (no network). Missing git, a non-repo
# cwd, or no origin remote all degrade to omitting the attribute.
repo_url=""
if command -v git >/dev/null 2>&1 && [ -n "$cwd" ] && [ -d "$cwd" ]; then
	repo_url="$(git -C "$cwd" remote get-url origin 2>/dev/null || true)"
fi

events="$(jq -n --arg repo_url "$repo_url" -f "$here/transcript-to-events.jq" "$transcript")" ||
	skip "failed to parse transcript; skipping"

count="$(jq 'length' <<<"$events")"
[ "${count:-0}" -gt 0 ] || exit 0 # early Stop before any assistant turn

# Build the request body, attaching workspace/project only when provided. The
# (potentially large) events array is fed to jq via stdin and the body to curl
# via stdin — never as a command-line argument, which would hit the OS argv size
# limit on long sessions and silently drop telemetry. Only small scalars go in
# argv.
jq_args=(--arg s "$session")
filter='{sessionId: $s, events: .}'
if [ -n "$SPANTAIL_WORKSPACE_ID" ]; then
	jq_args+=(--arg w "$SPANTAIL_WORKSPACE_ID")
	filter+=' + {workspaceId: $w}'
fi
if [ -n "$SPANTAIL_PROJECT_ID" ]; then
	jq_args+=(--arg p "$SPANTAIL_PROJECT_ID")
	filter+=' + {projectId: $p}'
fi

# Bounded timeouts so a slow or down network never blocks the user's turn:
# this is best-effort telemetry and the hook exits 0 on any failure.
jq "${jq_args[@]}" "$filter" <<<"$events" |
	curl -fsS --connect-timeout 2 --max-time 10 -X POST \
		"$SPANTAIL_API_URL/api/v1/agent-events" \
		-H "authorization: Bearer $SPANTAIL_AGENT_TOKEN" \
		-H 'content-type: application/json' \
		--data-binary @- >/dev/null 2>&1 ||
	skip "ingest request failed; skipping"

printf 'spantail-agent-stop: ingested %s event(s) for session %s\n' "$count" "$session" >&2
