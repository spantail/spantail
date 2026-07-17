#!/usr/bin/env bash
#
# Spantail configuration doctor → resolution report for the /spantail:doctor
# skill. For every config key it prints the resolved value and the layer it
# came from (env / .spantail/config.local.json / .spantail/config.json /
# plugin option / global settings), masking credentials, then a verdict on
# telemetry, MCP, and this repository's attribution. Read-only; exits 0.
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

# report ENV_VAR_NAME userConfigKey secret — one "key: value (source)" line.
report() {
	local env_name="$1" key="$2" secret="$3" val src shown
	val="$(spantail_config "$env_name" "$key")"
	src="$(source_of "$env_name" "$key")"
	if [ -z "$val" ]; then
		say "$key: unset"
		return 0
	fi
	shown="$val"
	if [ "$secret" = secret ]; then
		# Never print credentials; the expected prefix is enough to spot a
		# token pasted into the wrong field.
		case "$val" in
		spantail_aat_*) shown="set (spantail_aat_…)" ;;
		spantail_pat_*) shown="set (spantail_pat_…)" ;;
		*) shown="set (unexpected format)" ;;
		esac
	fi
	say "$key: $shown ($src)"
}

say "repository: $repo"
report SPANTAIL_API_URL apiUrl plain
report SPANTAIL_AGENT_TOKEN agentToken secret
report SPANTAIL_API_TOKEN apiToken secret
report SPANTAIL_WORKSPACE_ID workspaceId plain
report SPANTAIL_PROJECT_ID projectId plain
report SPANTAIL_SEND_SESSION_SUMMARY sendSessionSummary plain
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

if [ -z "$api_url" ] || [ -z "$agent_token" ]; then
	say "telemetry: DISABLED — apiUrl and agentToken are required; reinstall the plugin or set SPANTAIL_API_URL / SPANTAIL_AGENT_TOKEN"
else
	say "telemetry: enabled ($api_url)"
fi

if [ -n "$workspace" ] || [ -n "$project" ]; then
	say "attribution: linked (workspace: ${workspace:-token default}, project: ${project:-none})"
else
	say "attribution: NOT LINKED — sessions fall back to the agent token's default workspace; if the token has none, ingest is rejected and telemetry is dropped. Run /spantail:link to link this repository."
fi

if [ -z "$api_token" ]; then
	say "mcp: apiToken unset — the bundled MCP server (skills/agents) is unavailable; telemetry hooks are unaffected"
else
	say "mcp: apiToken set (note: the MCP server reads the plugin dialog value only; SPANTAIL_* env overrides do not apply to it)"
fi
