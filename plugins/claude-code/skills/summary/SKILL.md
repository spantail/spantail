---
name: summary
description: Turn sending this session's title to Spantail on or off. Use
  when the user says something like "/spantail:summary on", "record what this
  session was about in Spantail", or "don't send this session's summary".
disable-model-invocation: true
allowed-tools: [Bash]
---

Toggle, for THIS session only, whether the SessionEnd hook sends this
session's title to Spantail as the agent entry's description — the title of
its plan file, or, without a plan, the session title Claude Code generated
(exists only on compacted/resumed sessions). The per-session choice
overrides the plugin's `sendSessionSummary` setting; without it the setting
(default: off) applies.

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
   title — the plan file's title, else the generated session title — is
   stored in Spantail as the entry description and may appear in reports
   and share links; a session with neither sends nothing. With `off`,
   nothing is sent.
