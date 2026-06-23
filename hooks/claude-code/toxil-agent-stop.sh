#!/usr/bin/env bash
#
# Claude Code "Stop" hook → Toxil agent-events ingest.
#
# Reads the hook payload (JSON on stdin), extracts per-assistant-message token
# usage from the transcript with jq (conversation bodies never leave this
# machine), and POSTs the compact events to Toxil. Idempotent on (agent,
# message.id), so it is safe to run on every Stop. Never fails the turn: any
# problem logs to stderr and exits 0.
#
# Requirements: bash, jq, curl.
# Environment (set these in your Claude Code settings.json "env" block):
#   TOXIL_API_URL        Base URL, e.g. https://toxil.example.com
#   TOXIL_AGENT_TOKEN    An agent access token (write-only ingest credential)
#   TOXIL_WORKSPACE_ID   Optional; defaults to the token's bound workspace
#   TOXIL_PROJECT_ID     Optional; records the work against a project
set -u

skip() {
	printf 'toxil-agent-stop: %s\n' "$1" >&2
	exit 0
}

command -v jq >/dev/null 2>&1 || skip "jq not found; skipping"
command -v curl >/dev/null 2>&1 || skip "curl not found; skipping"
[ -n "${TOXIL_API_URL:-}" ] || skip "TOXIL_API_URL not set; skipping"
[ -n "${TOXIL_AGENT_TOKEN:-}" ] || skip "TOXIL_AGENT_TOKEN not set; skipping"

hook_payload="$(cat)"
transcript="$(jq -r '.transcript_path // empty' <<<"$hook_payload")"
session="$(jq -r '.session_id // empty' <<<"$hook_payload")"
[ -n "$transcript" ] || skip "no transcript_path in hook payload; skipping"
[ -f "$transcript" ] || skip "transcript not found: $transcript; skipping"
[ -n "$session" ] || skip "no session_id in hook payload; skipping"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
events="$(jq -n -f "$here/transcript-to-events.jq" "$transcript")" ||
	skip "failed to parse transcript; skipping"

count="$(jq 'length' <<<"$events")"
[ "${count:-0}" -gt 0 ] || exit 0 # early Stop before any assistant turn

# Build the request body, attaching workspace/project only when provided.
jq_args=(-n --arg s "$session" --argjson e "$events")
filter='{sessionId: $s, events: $e}'
if [ -n "${TOXIL_WORKSPACE_ID:-}" ]; then
	jq_args+=(--arg w "$TOXIL_WORKSPACE_ID")
	filter+=' + {workspaceId: $w}'
fi
if [ -n "${TOXIL_PROJECT_ID:-}" ]; then
	jq_args+=(--arg p "$TOXIL_PROJECT_ID")
	filter+=' + {projectId: $p}'
fi
body="$(jq "${jq_args[@]}" "$filter")"

curl -fsS -X POST "$TOXIL_API_URL/api/v1/agent-events" \
	-H "authorization: Bearer $TOXIL_AGENT_TOKEN" \
	-H 'content-type: application/json' \
	--data-binary "$body" >/dev/null 2>&1 ||
	skip "ingest request failed; skipping"

printf 'toxil-agent-stop: ingested %s event(s) for session %s\n' "$count" "$session" >&2
