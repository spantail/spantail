---
name: summary
description: Turn sending this session's summary title to Spantail on or off.
  Use when the user says something like "/spantail:summary on", "send this
  session's summary to Spantail", or "don't record what this session was
  about".
disable-model-invocation: true
allowed-tools: [Bash]
---

Toggle, for THIS session only, whether the SessionEnd hook sends Claude
Code's generated session summary title to Spantail as the agent entry's
description. The per-session choice overrides the plugin's
`sendSessionSummary` setting; without it the setting (default: off) applies.

`$ARGUMENTS` is `on`, `off`, or empty (= show the current state).

1. Both `$SPANTAIL_SESSION_ID` and `$SPANTAIL_PLUGIN_DATA` (exported by the
   plugin's SessionStart hook) must be set. If either is missing, say the
   toggle isn't available in this session (the plugin's SessionStart hook has
   not run — usually the plugin was enabled mid-session; a new session fixes
   it) and stop.
2. The marker file is `"$SPANTAIL_PLUGIN_DATA/summary-$SPANTAIL_SESSION_ID"`.
   - `on` / `off`: `mkdir -p "$SPANTAIL_PLUGIN_DATA"` and write exactly that
     word into the marker file.
   - no argument: read the marker file (absent = no per-session override, the
     plugin setting applies).
3. Confirm the effect to the user: with `on`, when this session ends its
   summary title (a short, conversation-derived line) is stored in Spantail
   and may appear in reports and share links; with `off`, it is not sent.
