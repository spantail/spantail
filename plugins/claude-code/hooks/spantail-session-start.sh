#!/usr/bin/env bash
#
# Claude Code "SessionStart" hook → exports the summary-toggle environment
# and plugin-config token presence.
#
# The /spantail:summary and /spantail:doctor skills run as Bash tool calls
# inside the session, which receive neither the hook payload (session id,
# plugin data dir) nor the CLAUDE_PLUGIN_OPTION_* variables that carry the
# keychain-stored tokens — only hook subprocesses see those. This hook is
# the bridge: it exports the session id and data dir for the summary
# marker, and the *presence and prefix class* of the plugin-config tokens
# (never their values) so the doctor can tell "configured via the dialog"
# from "unset". Never fails the session: exits 0 always.
#
# Requirements: bash, jq.
set -u

skip() {
	printf 'spantail-session-start: %s\n' "$1" >&2
	exit 0
}

command -v jq >/dev/null 2>&1 || skip "jq not found; skipping"
[ -n "${CLAUDE_ENV_FILE:-}" ] || skip "CLAUDE_ENV_FILE not set; skipping"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/config.sh
. "$here/lib/config.sh"
spantail_load_user_config

# token_state userConfigKey expectedPrefix — presence + prefix class of a
# plugin-config token. The unset env-var name skips the SPANTAIL_* layer:
# the markers describe the plugin config specifically, which is what the
# doctor cannot see from a Bash tool call.
token_state() {
	local val
	val="$(spantail_config _SPANTAIL_UNSET_ "$1")"
	case "$val" in
	"") printf 'unset' ;;
	"$2"_*) printf '%s' "$2" ;;
	*) printf 'unexpected' ;;
	esac
}

printf 'SPANTAIL_PLUGIN_AGENT_TOKEN_STATE=%s\n' "$(token_state agentToken spantail_aat)" >>"$CLAUDE_ENV_FILE"
printf 'SPANTAIL_PLUGIN_API_TOKEN_STATE=%s\n' "$(token_state apiToken spantail_pat)" >>"$CLAUDE_ENV_FILE"

session="$(jq -r '.session_id // empty')"
[ -n "$session" ] || skip "no session_id in hook payload; skipping"
case "$session" in
*[!A-Za-z0-9._-]*) skip "unexpected session_id format; skipping" ;;
esac

printf 'SPANTAIL_SESSION_ID=%s\n' "$session" >>"$CLAUDE_ENV_FILE"
if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
	printf 'SPANTAIL_PLUGIN_DATA=%s\n' "$CLAUDE_PLUGIN_DATA" >>"$CLAUDE_ENV_FILE"
fi
