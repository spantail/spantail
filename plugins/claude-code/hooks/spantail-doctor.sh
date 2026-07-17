#!/usr/bin/env bash
#
# Spantail configuration doctor → resolution report for the /spantail:doctor
# skill. For every config key it prints the resolved value and the layer it
# came from (env / .spantail/config.local.json / .spantail/config.json /
# plugin option / global settings), masking credentials, then a verdict on
# telemetry, MCP, and this repository's attribution. Read-only; exits 0.
#
# This script runs as a Bash tool call, which — unlike hook subprocesses —
# receives no CLAUDE_PLUGIN_OPTION_* variables, and keychain-stored tokens
# never appear in settings.json. Token presence therefore comes from the
# SPANTAIL_PLUGIN_*_STATE markers the SessionStart hook exports (presence
# and prefix class only, never values); without them it is reported as
# unknown, not unset.
#
# Requirements: bash, jq.
set -u

say() { printf '%s\n' "$1"; }

command -v jq >/dev/null 2>&1 || {
	say "jq not found — the Spantail hooks skip silently without it; install jq"
	exit 0
}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Hooks receive CLAUDE_PROJECT_DIR from Claude Code; this script may run from
# a Bash tool call where it is absent, so fall back to the git toplevel.
repo="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
export CLAUDE_PROJECT_DIR="$repo"

# shellcheck source=lib/config.sh
. "$here/lib/config.sh"
spantail_load_user_config

# source_of ENV_VAR_NAME userConfigKey — names the layer spantail_config
# would resolve the key from; empty when unset everywhere.
source_of() {
	local env_name="$1" key="$2" upper snake candidate
	if [ -n "${!env_name:-}" ]; then
		printf 'env %s' "$env_name"
		return 0
	fi
	case "$key" in
	workspaceId | projectId)
		if [ -n "$(_spantail_repo_value_from "$_spantail_repo_local_json" "$key")" ]; then
			printf '.spantail/config.local.json'
			return 0
		fi
		if [ -n "$(_spantail_repo_value_from "$_spantail_repo_shared_json" "$key")" ]; then
			printf '.spantail/config.json'
			return 0
		fi
		;;
	esac
	upper="$(printf '%s' "$key" | tr '[:lower:]' '[:upper:]')"
	snake="$(printf '%s' "$key" | sed 's/\([A-Z]\)/_\1/g' | tr '[:lower:]' '[:upper:]')"
	for candidate in "CLAUDE_PLUGIN_OPTION_$key" "CLAUDE_PLUGIN_OPTION_$upper" "CLAUDE_PLUGIN_OPTION_$snake"; do
		if [ -n "${!candidate:-}" ]; then
			printf 'plugin option, user-global'
			return 0
		fi
	done
	if [ -n "$(jq -r --arg k "$key" '.[$k] // empty | if type == "string" then . else tojson end' \
		<<<"${_spantail_plugin_options_json:-{}}" 2>/dev/null)" ]; then
		printf 'global settings pluginConfigs, user-global'
	fi
}

# report ENV_VAR_NAME userConfigKey — one "key: value (source)" line for a
# non-sensitive key.
report() {
	local env_name="$1" key="$2" val src
	val="$(spantail_config "$env_name" "$key")"
	if [ -z "$val" ]; then
		case "$key" in
		workspaceId | projectId)
			if [ -n "${_spantail_repo_linked:-}" ]; then
				say "$key: unset (repository-owned link; user-global values ignored)"
				return 0
			fi
			;;
		esac
		say "$key: unset"
		return 0
	fi
	src="$(source_of "$env_name" "$key")"
	say "$key: $val ($src)"
}

# report_secret ENV_VAR_NAME userConfigKey markerValue expectedPrefix — like
# report, but never prints the value (prefix class only), and falls back to
# the SessionStart marker for keychain-stored tokens this process can't see.
report_secret() {
	local env_name="$1" key="$2" marker="$3" prefix="$4" val src
	val="$(spantail_config "$env_name" "$key")"
	if [ -n "$val" ]; then
		src="$(source_of "$env_name" "$key")"
		case "$val" in
		"$prefix"_*) say "$key: set (${prefix}_…) ($src)" ;;
		*) say "$key: set (unexpected format) ($src)" ;;
		esac
		return 0
	fi
	case "$marker" in
	"$prefix") say "$key: set (${prefix}_…) (plugin config, keychain; reported by SessionStart)" ;;
	unexpected) say "$key: set (unexpected format) (plugin config, keychain; reported by SessionStart)" ;;
	unset) say "$key: unset" ;;
	*) say "$key: unknown — keychain tokens are visible to hooks only, and the plugin's SessionStart has not run in this session" ;;
	esac
}

agent_marker="${SPANTAIL_PLUGIN_AGENT_TOKEN_STATE:-}"
api_marker="${SPANTAIL_PLUGIN_API_TOKEN_STATE:-}"

say "repository: $repo"
report SPANTAIL_API_URL apiUrl
report_secret SPANTAIL_AGENT_TOKEN agentToken "$agent_marker" spantail_aat
report_secret SPANTAIL_API_TOKEN apiToken "$api_marker" spantail_pat
report SPANTAIL_WORKSPACE_ID workspaceId
report SPANTAIL_PROJECT_ID projectId
report SPANTAIL_SEND_SESSION_SUMMARY sendSessionSummary
say ""

# Repo files may only set workspaceId/projectId; surface anything else so a
# stray apiUrl there doesn't look like it works.
for f in config.local.json config.json; do
	[ -f "$repo/.spantail/$f" ] || continue
	ignored="$(jq -r 'if type == "object" then [keys[] | select(. != "workspaceId" and . != "projectId")] | join(", ") else "not a JSON object" end' \
		"$repo/.spantail/$f" 2>/dev/null)" || ignored="unreadable (invalid JSON)"
	[ -n "$ignored" ] && say "warning: .spantail/$f — ignored: $ignored (repo files may only set workspaceId and projectId)"
done

api_url="$(spantail_config SPANTAIL_API_URL apiUrl)"
agent_token="$(spantail_config SPANTAIL_AGENT_TOKEN agentToken)"
api_token="$(spantail_config SPANTAIL_API_TOKEN apiToken)"
workspace="$(spantail_config SPANTAIL_WORKSPACE_ID workspaceId)"
project="$(spantail_config SPANTAIL_PROJECT_ID projectId)"

# agent_present: yes / no / unknown — resolved value, else SessionStart marker.
agent_present=unknown
if [ -n "$agent_token" ]; then
	agent_present=yes
else
	case "$agent_marker" in
	spantail_aat | unexpected) agent_present=yes ;;
	unset) agent_present=no ;;
	esac
fi

if [ -z "$api_url" ]; then
	say "telemetry: DISABLED — apiUrl is not configured; reinstall the plugin or set SPANTAIL_API_URL"
elif [ "$agent_present" = yes ]; then
	say "telemetry: enabled ($api_url)"
elif [ "$agent_present" = no ]; then
	say "telemetry: DISABLED — agentToken is not configured; reinstall the plugin or set SPANTAIL_AGENT_TOKEN"
else
	say "telemetry: unknown — the agent token lives in the keychain, which only hooks can read, and the plugin's SessionStart has not run in this session; start a new session and re-run /spantail:doctor"
fi

if [ -n "$workspace" ] || [ -n "$project" ]; then
	say "attribution: linked (workspace: ${workspace:-token default}, project: ${project:-none})"
else
	say "attribution: NOT LINKED — sessions fall back to the agent token's default workspace; if the token has none, ingest is rejected and telemetry is dropped. Run /spantail:link to link this repository."
fi

# The bundled MCP server authenticates from ${user_config.apiToken} in
# .mcp.json — env overrides never reach it, so judge MCP availability from
# the plugin user config alone (an unset env-var name skips the env layer,
# and the SessionStart marker stands in for the keychain).
mcp_cfg_token="$(spantail_config _SPANTAIL_DOCTOR_UNSET_ apiToken)"
if [ -n "$mcp_cfg_token" ] || [ "$api_marker" = spantail_pat ] || [ "$api_marker" = unexpected ]; then
	say "mcp: apiToken set — the bundled MCP server (skills/agents) is available"
elif [ -n "$api_token" ]; then
	say "mcp: apiToken set only via SPANTAIL_API_TOKEN — the bundled MCP server reads the plugin config, not the environment, so skills/agents remain unavailable; set apiToken in the plugin config"
elif [ "$api_marker" = unset ]; then
	say "mcp: apiToken unset — the bundled MCP server (skills/agents) is unavailable; telemetry hooks are unaffected"
else
	say "mcp: unknown — the personal API token lives in the keychain, which only hooks can read, and the plugin's SessionStart has not run in this session"
fi
