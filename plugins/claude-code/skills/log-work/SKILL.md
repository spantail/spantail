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

**Exception — GitHub issue form**: when `$ARGUMENTS` starts with `#<number>`
(e.g. `/spantail:log-work #123 2h yesterday`), use the GitHub flow below
instead of the free-text interpretation.

## Logging against a GitHub issue (`#N` form)

The server owns project resolution (via its repo→project mapping) and
argument parsing. Do NOT parse the duration or date, do NOT resolve a
project, and do NOT hold a project id in this plugin.

1. Split the leading `#N` off `$ARGUMENTS` → `issueNumber`. Everything after
   it is the raw `args` string — pass it verbatim (e.g. `"2h yesterday"`).
2. Collect the repo's remotes: run `git remote -v`, take the fetch URLs,
   deduplicate, and pass them verbatim as `remotes`.
3. Call `log_work_github` with `{ remotes, issueNumber, args }`.
4. Report back from `resolved`: repo, project name, date, duration, how many
   agent sessions were linked (`linkedAgentEntryIds`), and — if `degraded`
   is true — that the description is just the issue link because issue
   metadata was unavailable.
5. On error, surface the server's message verbatim: it contains the fix
   (grammar examples, or where to add the repo mapping).

Optional nicety when `degraded` is true and the `gh` CLI is available: fetch
the issue title with `gh issue view <N> --json title` and offer to update
the entry's description via `update_entry`.

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
