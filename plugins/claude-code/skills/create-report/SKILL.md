---
name: create-report
description: Create or update a Spantail report from work entries. Use when
  the user asks for a weekly/monthly report, a client-facing summary of logged
  work, or wants to preview report output before saving it.
---

Compose a Spantail report using the Spantail MCP tools.

## Preflight

Check that the Spantail MCP tools (`preview_report`, `list_report_templates`,
...) are available. If they are not, tell the user how to connect and stop:

- With this plugin: set its `apiToken` (a personal API token,
  `spantail_pat_...`) in the plugin config — the bundled MCP server then
  connects to `<apiUrl>/mcp` as you.
- Outside the plugin: `claude mcp add spantail -- spantail mcp` (stdio; needs
  the CLI, logged in via `spantail auth login`), or add `https://<instance>/mcp`
  as an HTTP MCP server with a personal API token as the Bearer credential.

## Creating a report

1. Pick the template: `list_report_templates`, choose the one matching the
   user's ask (weekly, monthly, ...). If several fit, ask.
2. Fix the scope: workspace (`list_workspaces`), optional projects
   (`list_projects`), and the period — prefer a preset (`this_week`,
   `last_month`, ...) over explicit dates when the user speaks in relative
   terms.
3. ALWAYS render with `preview_report` first, and QUOTE the rendered
   Markdown in your reply — the user cannot see tool results, so a preview
   they weren't shown is no preview at all. Quote the body verbatim (for a
   long report: the header, the section structure, and the totals, clearly
   marked as an excerpt). Only after the preview is visible in your message
   may you ask for confirmation, and only call `create_report` once they
   confirm. A report is a saved, versioned document — don't create one the
   user hasn't seen.
4. Report the saved report's name and id.

## Updating a report

Find it with `list_reports` / `get_report`, then `update_report` with only
the changed fields. Each update renders a new version; preview first when the
scope or period changes.

## Privacy

The rendered report and its note can be shared via public links and sent to
other people. Never put secrets or private personal data in report names or
notes.
