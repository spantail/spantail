#!/usr/bin/env bash
#
# Tests lib/config.sh resolution: env > repo .spantail files (workspaceId/
# projectId only) > plugin option env > global settings, plus the repo-file
# allowlist, charset validation, and degradation. Exits non-zero on failure,
# 0 on success, skips (0) without jq.
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v jq >/dev/null 2>&1; then
	echo "SKIP: jq not found"
	exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail=0
check() {
	local desc="$1" expected="$2" actual="$3"
	if [ "$actual" = "$expected" ]; then
		echo "ok   - $desc"
	else
		echo "FAIL - $desc (expected '$expected', got '$actual')"
		fail=1
	fi
}

# resolve ENV_VAR_NAME userConfigKey [NAME=value ...] — runs the resolution
# in a subshell with only the given environment, so the developer's real
# SPANTAIL_* / CLAUDE_* variables can't leak into the test.
resolve() (
	var="$1" key="$2"
	shift 2
	for v in "${!SPANTAIL_@}" "${!CLAUDE_PLUGIN_OPTION_@}"; do unset "$v"; done
	unset CLAUDE_PROJECT_DIR CLAUDE_CONFIG_DIR
	for kv in "$@"; do export "${kv?}"; done
	# shellcheck source=lib/config.sh
	. "$here/lib/config.sh"
	spantail_load_user_config
	spantail_config "$var" "$key"
)

# --- fixtures ---
cfg="$tmp/cfg"
mkdir -p "$cfg"
cat >"$cfg/settings.json" <<'EOF'
{
	"pluginConfigs": {
		"spantail@spantail": {
			"options": {
				"apiUrl": "https://global.example",
				"workspaceId": "ws-global",
				"projectId": "pj-global"
			}
		}
	}
}
EOF

repo="$tmp/repo"
mkdir -p "$repo/.spantail"
# The shared file also carries keys outside the allowlist, which must never
# resolve from a repo file.
cat >"$repo/.spantail/config.json" <<'EOF'
{
	"workspaceId": "ws-shared",
	"projectId": "pj-shared",
	"apiUrl": "https://evil.example",
	"agentToken": "spantail_aat_evil"
}
EOF
cat >"$repo/.spantail/config.local.json" <<'EOF'
{ "workspaceId": "ws-local" }
EOF

shared_only="$tmp/shared-only"
mkdir -p "$shared_only/.spantail"
printf '{ "workspaceId": "ws-shared" }\n' >"$shared_only/.spantail/config.json"

invalid="$tmp/invalid"
mkdir -p "$invalid/.spantail"
printf '{ "workspaceId": "ws bad!" }\n' >"$invalid/.spantail/config.local.json"
printf '{ "workspaceId": "ws-shared", "projectId": 42 }\n' >"$invalid/.spantail/config.json"

long="$tmp/long"
mkdir -p "$long/.spantail"
printf '{ "workspaceId": "%s" }\n' "$(printf 'a%.0s' $(seq 1 65))" >"$long/.spantail/config.local.json"
printf '{ "workspaceId": "ws-shared" }\n' >"$long/.spantail/config.json"

broken="$tmp/broken"
mkdir -p "$broken/.spantail"
printf 'not json\n' >"$broken/.spantail/config.local.json"
printf '["ws-array"]\n' >"$broken/.spantail/config.json"

ws_only="$tmp/ws-only"
mkdir -p "$ws_only/.spantail"
printf '{ "workspaceId": "ws-only" }\n' >"$ws_only/.spantail/config.local.json"

unlinked_marker="$tmp/unlinked-marker"
mkdir -p "$unlinked_marker/.spantail"
printf '{}\n' >"$unlinked_marker/.spantail/config.local.json"

empty="$tmp/empty"
mkdir -p "$empty"

# --- resolution order ---
check "env always wins" ws-env \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId SPANTAIL_WORKSPACE_ID=ws-env \
		CLAUDE_PROJECT_DIR="$repo" CLAUDE_CONFIG_DIR="$cfg")"
check "local file beats shared and global" ws-local \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId \
		CLAUDE_PROJECT_DIR="$repo" CLAUDE_CONFIG_DIR="$cfg")"
check "shared file fills keys the local file lacks" pj-shared \
	"$(resolve SPANTAIL_PROJECT_ID projectId \
		CLAUDE_PROJECT_DIR="$repo" CLAUDE_CONFIG_DIR="$cfg")"
check "shared file used without a local file" ws-shared \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId \
		CLAUDE_PROJECT_DIR="$shared_only" CLAUDE_CONFIG_DIR="$cfg")"
check "repo file beats the plugin option env" ws-local \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId CLAUDE_PLUGIN_OPTION_workspaceId=ws-opt \
		CLAUDE_PROJECT_DIR="$repo" CLAUDE_CONFIG_DIR="$cfg")"
check "plugin option env used without repo files" ws-opt \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId CLAUDE_PLUGIN_OPTION_workspaceId=ws-opt \
		CLAUDE_PROJECT_DIR="$empty" CLAUDE_CONFIG_DIR="$cfg")"
check "global settings are the final fallback" ws-global \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId \
		CLAUDE_PROJECT_DIR="$empty" CLAUDE_CONFIG_DIR="$cfg")"
check "no CLAUDE_PROJECT_DIR degrades to global settings" ws-global \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId CLAUDE_CONFIG_DIR="$cfg")"

# --- a linked repository owns attribution (no user-global fallback) ---
check "workspace-only link does not inherit a global projectId" "" \
	"$(resolve SPANTAIL_PROJECT_ID projectId \
		CLAUDE_PROJECT_DIR="$ws_only" CLAUDE_CONFIG_DIR="$cfg")"
check "workspace-only link does not inherit a plugin-option projectId" "" \
	"$(resolve SPANTAIL_PROJECT_ID projectId CLAUDE_PLUGIN_OPTION_projectId=pj-opt \
		CLAUDE_PROJECT_DIR="$ws_only" CLAUDE_CONFIG_DIR="$cfg")"
check "env projectId still wins over a workspace-only link" pj-env \
	"$(resolve SPANTAIL_PROJECT_ID projectId SPANTAIL_PROJECT_ID=pj-env \
		CLAUDE_PROJECT_DIR="$ws_only" CLAUDE_CONFIG_DIR="$cfg")"
check "an empty link file blocks the global workspaceId too" "" \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId \
		CLAUDE_PROJECT_DIR="$unlinked_marker" CLAUDE_CONFIG_DIR="$cfg")"

# --- repo-file allowlist ---
check "apiUrl never resolves from a repo file" https://global.example \
	"$(resolve SPANTAIL_API_URL apiUrl \
		CLAUDE_PROJECT_DIR="$repo" CLAUDE_CONFIG_DIR="$cfg")"
check "agentToken never resolves from a repo file" "" \
	"$(resolve SPANTAIL_AGENT_TOKEN agentToken \
		CLAUDE_PROJECT_DIR="$repo" CLAUDE_CONFIG_DIR="$tmp/no-cfg")"

# --- validation and degradation ---
check "value outside the id charset is ignored" ws-shared \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId \
		CLAUDE_PROJECT_DIR="$invalid" CLAUDE_CONFIG_DIR="$cfg")"
check "non-string value is ignored, not inherited from global" "" \
	"$(resolve SPANTAIL_PROJECT_ID projectId \
		CLAUDE_PROJECT_DIR="$invalid" CLAUDE_CONFIG_DIR="$cfg")"
check "value longer than 64 chars is ignored" ws-shared \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId \
		CLAUDE_PROJECT_DIR="$long" CLAUDE_CONFIG_DIR="$cfg")"
check "invalid JSON and non-object files degrade to global" ws-global \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId \
		CLAUDE_PROJECT_DIR="$broken" CLAUDE_CONFIG_DIR="$cfg")"
check "missing settings file degrades to empty" "" \
	"$(resolve SPANTAIL_WORKSPACE_ID workspaceId \
		CLAUDE_PROJECT_DIR="$empty" CLAUDE_CONFIG_DIR="$tmp/no-cfg")"

if [ "$fail" -ne 0 ]; then
	echo "config.sh: FAILED"
	exit 1
fi
echo "config.sh: PASSED"
