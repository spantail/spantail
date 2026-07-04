#!/usr/bin/env bash
#
# Claude Code "SessionEnd" hook → final reconcile + Spantail session finalize.
#
# Two steps, both best-effort:
#   1. Re-run the Stop hook with the same payload. Event ingest is idempotent
#      on (agent, message.id), so this only recovers turns a Stop hook missed
#      (e.g. right after a compact) and never double-counts.
#   2. POST the session's closing facts to /api/v1/agent-events/finalize:
#      wall-clock end, PR refs, and — only when opted in — the session's
#      summary title as the description. A 404 (no entry yet: the session
#      produced no events) is expected and ignored.
#
# Never blocks the session from ending: any problem logs to stderr and exits 0.
#
# Requirements: bash, jq, curl. Configuration as in spantail-agent-stop.sh,
# plus the summary opt-in, resolved in this order: the per-session marker
# written by /spantail:summary, the SPANTAIL_SEND_SESSION_SUMMARY env var,
# then the plugin's sendSessionSummary user config. Default off.
set -u

skip() {
	printf 'spantail-session-end: %s\n' "$1" >&2
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
[ -n "$SPANTAIL_API_URL" ] || skip "SPANTAIL_API_URL not configured; skipping"
[ -n "$SPANTAIL_AGENT_TOKEN" ] || skip "SPANTAIL_AGENT_TOKEN not configured; skipping"

# stdin is consumed once; capture it so both steps can use it.
hook_payload="$(cat)"
transcript="$(jq -r '.transcript_path // empty' <<<"$hook_payload")"
session="$(jq -r '.session_id // empty' <<<"$hook_payload")"
reason="$(jq -r '.reason // "unknown"' <<<"$hook_payload")"
[ -n "$transcript" ] || skip "no transcript_path in hook payload; skipping"
[ -f "$transcript" ] || skip "transcript not found: $transcript; skipping"
[ -n "$session" ] || skip "no session_id in hook payload; skipping"

# Step 1: final reconcile. The Stop hook exits 0 on any failure, so this can
# never break the chain.
printf '%s' "$hook_payload" | "$here/spantail-agent-stop.sh"

# Summary opt-in: per-session marker > env var > user config, default off.
# The session id becomes part of the marker path, so only accept the expected
# id charset — a hostile payload must not steer the rm below.
send_summary="false"
marker=""
case "$session" in
*[!A-Za-z0-9._-]*) ;;
*)
	if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
		marker="$CLAUDE_PLUGIN_DATA/summary-$session"
	fi
	;;
esac
if [ -n "$marker" ] && [ -f "$marker" ]; then
	[ "$(cat "$marker" 2>/dev/null)" = "on" ] && send_summary="true"
else
	opt_in="$(spantail_config SPANTAIL_SEND_SESSION_SUMMARY sendSessionSummary)"
	[ "$opt_in" = "true" ] && send_summary="true"
fi
# The marker is per-session state; the session is over, so clean it up.
[ -n "$marker" ] && rm -f "$marker"

# Step 2: finalize with closing facts.
body="$(jq -n --arg session "$session" --arg send_summary "$send_summary" \
	-f "$here/transcript-to-finalize.jq" "$transcript")" ||
	skip "failed to parse transcript; skipping finalize"

if [ -n "$SPANTAIL_WORKSPACE_ID" ]; then
	body="$(jq --arg w "$SPANTAIL_WORKSPACE_ID" '. + {workspaceId: $w}' <<<"$body")"
fi

# 404 means the session never produced events (no entry to finalize) — that is
# the documented best-effort contract, not an error worth surfacing.
printf '%s' "$body" |
	curl -fsS --connect-timeout 2 --max-time 10 -X POST \
		"$SPANTAIL_API_URL/api/v1/agent-events/finalize" \
		-H "authorization: Bearer $SPANTAIL_AGENT_TOKEN" \
		-H 'content-type: application/json' \
		--data-binary @- >/dev/null 2>&1 ||
	skip "finalize skipped (no entry yet, or request failed)"

printf 'spantail-session-end: finalized session %s (reason: %s)\n' "$session" "$reason" >&2
