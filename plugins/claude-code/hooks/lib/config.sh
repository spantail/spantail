# Shared configuration resolution for the Spantail hooks.
#
# Resolution order per value:
#   1. The SPANTAIL_* environment variable (manual wiring; always wins).
#   2. The plugin user config, which Claude Code exports to plugin
#      subprocesses as CLAUDE_PLUGIN_OPTION_<KEY> environment variables with
#      the manifest key verbatim (CLAUDE_PLUGIN_OPTION_agentToken); sensitive
#      values are resolved from the system keychain. Uppercased key forms are
#      also checked defensively.
#   3. settings.json's pluginConfigs[<plugin-id>].options — a fallback for
#      non-sensitive values when the option env vars are absent (e.g. a
#      future execution path that doesn't export them).
#
# Everything degrades to empty — callers decide whether a missing value means
# skipping (exit 0), so a misconfigured plugin never fails a turn or a
# session. Requires jq (callers check for it before sourcing).

_spantail_plugin_options_json=""

spantail_load_user_config() {
	local settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
	_spantail_plugin_options_json="{}"
	[ -f "$settings" ] || return 0
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
}

# spantail_config ENV_VAR_NAME userConfigKey — echoes the resolved value.
spantail_config() {
	local env_val="${!1:-}"
	if [ -n "$env_val" ]; then
		printf '%s' "$env_val"
		return 0
	fi

	# CLAUDE_PLUGIN_OPTION_<KEY> uses the manifest key verbatim (documented);
	# the uppercased forms are checked as a defensive fallback.
	local key="$2" upper snake opt_val
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
