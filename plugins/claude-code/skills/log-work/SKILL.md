---
name: log-work
description: Log a work entry to Spantail. Use when the user wants to record
  time spent, log what they worked on, or capture the current session's work
  as a Spantail work entry.
---

Log one or more work entries to the user's Spantail instance using the
Spantail MCP tools.

## Preflight

Check that the Spantail MCP tools (`log_work`, `list_workspaces`, ...) are
available. If they are not, do NOT attempt any other way of writing to
Spantail; tell the user how to connect and stop:

- With this plugin: set its `apiToken` (a personal API token,
  `spantail_pat_...`) in the plugin config — the bundled MCP server then
  connects to `<apiUrl>/mcp` as you.
- Outside the plugin: `claude mcp add spantail -- spantail mcp` (stdio; needs
  the CLI, logged in via `spantail auth login`), or add `https://<instance>/mcp`
  as an HTTP MCP server with a personal API token as the Bearer credential.

## Interpreting the request

`$ARGUMENTS` is free text, e.g. "fixed auth bug, 2h, project core" or empty.
Extract what you can: description, duration, project, date (default: today).

When invoked with no arguments, propose an entry from the current
conversation: summarize what was actually worked on into a short description
and estimate the time spent, then confirm with the user before logging.

## Logging

1. Resolve ids: `list_workspaces`, then `list_projects` for the chosen
   workspace. If the workspace or project is ambiguous, present the options
   and ask instead of guessing.
2. Create the entry with `log_work` (`durationMinutes`, `description`,
   optional `entryDate`, `note`, `tags`). For several entries at once (e.g.
   "log everything I did today"), use `log_work_batch`.
3. Report back what was logged: date, project, duration, description.

## Privacy

The description and note are stored verbatim and can appear in reports,
public share links, and sent copies. Never put secrets, tokens, or private
personal data in them.
