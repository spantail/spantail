#!/usr/bin/env bash
#
# Claude Code "SessionStart" hook → exports the summary-toggle environment.
#
# The /spantail:summary toggle skill runs as a Bash tool call inside the
# session, which has no other way to learn the session id or the plugin's
# data directory. Exporting both via CLAUDE_ENV_FILE lets the skill write the
# per-session summary marker that spantail-session-end.sh reads. Never fails
# the session: exits 0 always.
#
# Requirements: bash, jq.
set -u

skip() {
	printf 'spantail-session-start: %s\n' "$1" >&2
	exit 0
}

command -v jq >/dev/null 2>&1 || skip "jq not found; skipping"
[ -n "${CLAUDE_ENV_FILE:-}" ] || skip "CLAUDE_ENV_FILE not set; skipping"

session="$(jq -r '.session_id // empty')"
[ -n "$session" ] || skip "no session_id in hook payload; skipping"
case "$session" in
*[!A-Za-z0-9._-]*) skip "unexpected session_id format; skipping" ;;
esac

printf 'SPANTAIL_SESSION_ID=%s\n' "$session" >>"$CLAUDE_ENV_FILE"
if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
	printf 'SPANTAIL_PLUGIN_DATA=%s\n' "$CLAUDE_PLUGIN_DATA" >>"$CLAUDE_ENV_FILE"
fi
