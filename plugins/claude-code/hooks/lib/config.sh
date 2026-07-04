# Shared configuration resolution for the Spantail hooks.
#
# Resolution order per value: the SPANTAIL_* environment variable wins;
# otherwise the plugin's user config stored by Claude Code in
# ~/.claude/settings.json (pluginUserConfig). Everything degrades to empty —
# callers decide whether a missing value means skipping (exit 0), so a
# misconfigured plugin never fails a turn or a session.
#
# Requires jq (callers check for it before sourcing).

_spantail_user_config_json=""

spantail_load_user_config() {
	local settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
	_spantail_user_config_json="{}"
	[ -f "$settings" ] || return 0
	# The store is keyed "<plugin>@<marketplace>"; match on the plugin name
	# prefix so a renamed or locally-added marketplace still resolves.
	_spantail_user_config_json="$(jq -c '
		(.pluginUserConfig // {}) | to_entries
		| map(select(.key | startswith("spantail@")))
		| (first.value // {})
	' "$settings" 2>/dev/null || printf '{}')"
}

# spantail_config ENV_VAR_NAME userConfigKey — echoes the resolved value.
spantail_config() {
	local env_val="${!1:-}"
	if [ -n "$env_val" ]; then
		printf '%s' "$env_val"
		return 0
	fi
	jq -r --arg k "$2" '.[$k] // empty | if type == "string" then . else tojson end' \
		<<<"${_spantail_user_config_json:-{}}" 2>/dev/null
}
