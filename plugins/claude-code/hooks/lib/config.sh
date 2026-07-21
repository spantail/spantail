# Shared configuration resolution for the Spantail hooks.
#
# Resolution order per value:
#   1. The SPANTAIL_* environment variable (manual wiring; always wins).
#   2. Repo-level attribution files, workspaceId/projectId only (see below):
#      $CLAUDE_PROJECT_DIR/.spantail/config.local.json (personal, gitignored),
#      then $CLAUDE_PROJECT_DIR/.spantail/config.json (committed, shared).
#   3. The plugin user config, which Claude Code exports to plugin
#      subprocesses as CLAUDE_PLUGIN_OPTION_<KEY> environment variables with
#      the manifest key verbatim (CLAUDE_PLUGIN_OPTION_agentToken); sensitive
#      values are resolved from the system keychain. Uppercased key forms are
#      also checked defensively.
#   4. settings.json's pluginConfigs[<plugin-id>].options — a fallback for
#      non-sensitive values when the option env vars are absent (e.g. a
#      future execution path that doesn't export them).
#
# Only workspaceId and projectId may resolve from the repo files: a cloned
# repository is untrusted input (docs/security.md), so keys that steer where
# telemetry is sent (apiUrl) or credentials must never come from it. Values
# are charset-checked like session ids and length-capped; anything else is
# ignored.
#
# A repository with a parseable .spantail file OWNS attribution: for
# workspaceId/projectId, layers 3 and 4 are then skipped entirely, so a
# workspace-only link cannot pair with a stale user-global projectId (which
# would misattribute sessions, or drop them when the server rejects a
# project outside the workspace). The same rule holds between the two repo
# files: a parseable local file replaces the shared one entirely — never a
# per-key merge — so a personal workspace-only link cannot inherit the
# team's project. An unparseable file does not claim ownership — it
# degrades like every other error, and the doctor reports it.
#
# Everything degrades to empty — callers decide whether a missing value means
# skipping (exit 0), so a misconfigured plugin never fails a turn or a
# session. Requires jq (callers check for it before sourcing).

_spantail_plugin_options_json=""
_spantail_repo_local_json=""
_spantail_repo_shared_json=""
_spantail_repo_local_ok=""
_spantail_repo_shared_ok=""
_spantail_repo_linked=""

spantail_load_user_config() {
	local settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
	_spantail_plugin_options_json="{}"
	if [ -f "$settings" ]; then
		# The store is keyed by plugin id — "spantail" or "spantail@<marketplace>".
		# Match exactly those forms so another plugin whose name merely starts
		# with "spantail" can't shadow this one's options, and prefer the
		# marketplace-qualified id deterministically when both forms exist
		# (object entry order in settings.json is not guaranteed).
		_spantail_plugin_options_json="$(jq -c '
			(.pluginConfigs // {}) | to_entries
			| map(select(.key == "spantail" or (.key | startswith("spantail@"))))
			| sort_by(if .key == "spantail" then 1 else 0 end)
			| (first.value.options // {})
		' "$settings" 2>/dev/null || printf '{}')"
	fi

	_spantail_repo_local_json="{}"
	_spantail_repo_shared_json="{}"
	_spantail_repo_local_ok=""
	_spantail_repo_shared_ok=""
	_spantail_repo_linked=""
	local repo="${CLAUDE_PROJECT_DIR:-}" parsed
	[ -n "$repo" ] || return 0
	if parsed="$(_spantail_repo_parse_file "$repo/.spantail/config.local.json")"; then
		_spantail_repo_local_json="$parsed"
		_spantail_repo_local_ok=1
		_spantail_repo_linked=1
	fi
	if parsed="$(_spantail_repo_parse_file "$repo/.spantail/config.json")"; then
		_spantail_repo_shared_json="$parsed"
		_spantail_repo_shared_ok=1
		_spantail_repo_linked=1
	fi
}

# _spantail_repo_parse_file path — echoes the file's parsed JSON object, or
# fails. The size cap runs before jq: the file is repo-controlled and parsed
# on every Stop/SessionEnd, so an oversized config must not cost a jq run
# per turn — a real one holds two short ids and stays far under 4 KB.
_spantail_repo_parse_file() {
	local f="$1" size
	[ -f "$f" ] || return 1
	size="$(wc -c <"$f" 2>/dev/null)" || return 1
	[ "${size:-0}" -le 4096 ] || return 1
	jq -c 'if type == "object" then . else error("not an object") end' "$f" 2>/dev/null
}

# _spantail_repo_value_from json key — echoes one repo layer's value for an
# attribution key. Non-string values, values outside the id charset, and
# values longer than 64 characters (ids are 36-char UUIDs; the cap keeps an
# adversarial megabyte "id" out of jq/curl argv) are ignored — the repo is
# untrusted input. Also used by the doctor script to report which layer a
# value comes from.
_spantail_repo_value_from() {
	local val
	val="$(jq -r --arg k "$2" '.[$k] // empty | strings' <<<"${1:-{}}" 2>/dev/null)"
	[ -n "$val" ] || return 0
	[ "${#val}" -le 64 ] || return 0
	case "$val" in *[!A-Za-z0-9._-]*) return 0 ;; esac
	printf '%s' "$val"
}

# _spantail_repo_value key — the owning file's value: a parseable personal
# file replaces the shared one entirely (no per-key merge across the two).
_spantail_repo_value() {
	if [ -n "$_spantail_repo_local_ok" ]; then
		_spantail_repo_value_from "$_spantail_repo_local_json" "$1"
	elif [ -n "$_spantail_repo_shared_ok" ]; then
		_spantail_repo_value_from "$_spantail_repo_shared_json" "$1"
	fi
}

# spantail_config ENV_VAR_NAME userConfigKey — echoes the resolved value.
# apiUrl drops trailing slashes from every layer: hooks append /api/v1/...
# to it, and a path-scoped proxy in front of the instance can reject the
# doubled slash before the server-side normalization ever runs.
spantail_config() {
	local val
	val="$(_spantail_config_resolve "$@")"
	if [ "$2" = "apiUrl" ]; then
		while [ "${val%/}" != "$val" ]; do val="${val%/}"; done
	fi
	printf '%s' "$val"
}

_spantail_config_resolve() {
	local env_val="${!1:-}"
	if [ -n "$env_val" ]; then
		printf '%s' "$env_val"
		return 0
	fi

	local key="$2" upper snake opt_val
	case "$key" in
	workspaceId | projectId)
		# A linked repository owns attribution: return its value — possibly
		# empty for a deliberately workspace-only (or empty) link — and never
		# fall through to the user-global layers below.
		if [ -n "${_spantail_repo_linked:-}" ]; then
			printf '%s' "$(_spantail_repo_value "$key")"
			return 0
		fi
		;;
	esac

	# CLAUDE_PLUGIN_OPTION_<KEY> uses the manifest key verbatim (documented);
	# the uppercased forms are checked as a defensive fallback.
	upper="$(printf '%s' "$key" | tr '[:lower:]' '[:upper:]')"
	snake="$(printf '%s' "$key" | sed 's/\([A-Z]\)/_\1/g' | tr '[:lower:]' '[:upper:]')"
	for candidate in "CLAUDE_PLUGIN_OPTION_$key" "CLAUDE_PLUGIN_OPTION_$upper" "CLAUDE_PLUGIN_OPTION_$snake"; do
		opt_val="${!candidate:-}"
		if [ -n "$opt_val" ]; then
			printf '%s' "$opt_val"
			return 0
		fi
	done

	jq -r --arg k "$key" \
		'.[$k] // empty | if type == "string" then . else tojson end' \
		<<<"${_spantail_plugin_options_json:-{}}" 2>/dev/null
}
