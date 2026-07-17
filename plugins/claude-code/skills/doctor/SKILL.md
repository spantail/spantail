---
name: doctor
description: Diagnose the Spantail plugin's configuration for this repository.
  Use when sessions are missing from Spantail, land in the wrong workspace or
  project, or the user wants to check where telemetry is going.
disable-model-invocation: true
allowed-tools: [Bash]
---

Report how the Spantail plugin's configuration resolves in this repository
and what to fix.

1. Run the bundled doctor script:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/hooks/spantail-doctor.sh"
   ```

   It prints each config key with its resolved value and source layer
   (credentials are masked), warnings about ignored keys in `.spantail/`
   files, and a verdict on telemetry, attribution, and MCP availability.
2. Relay the report and turn any problem into the concrete next step:
   - `telemetry: DISABLED` — the plugin's user config is incomplete;
     re-run the install dialog (reinstall the plugin) or wire
     `SPANTAIL_API_URL` / `SPANTAIL_AGENT_TOKEN` manually.
   - `attribution: NOT LINKED` — run `/spantail:link` to link this
     repository to a workspace and project; until then sessions depend on
     the agent token's default workspace and may be dropped entirely.
   - `warning: … ignored` — the repo file sets keys the hooks refuse to
     read; move `apiUrl`/tokens back to the plugin config.
   - `mcp: apiToken unset` — only relevant if the user wants the Spantail
     skills/agents; telemetry works without it.
3. Never echo token values; the script already masks them — keep it that
   way in your summary.
