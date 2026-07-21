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
2. Collect the repo's remotes and the current session id in one shell call:
   run `git remote -v; printf '%s\n' "$SPANTAIL_SESSION_ID"`. Take the fetch
   URLs, deduplicate, and pass them verbatim as `remotes`. If
   `$SPANTAIL_SESSION_ID` is non-empty, pass it as `sessionId` — the server
   then links this session's agent entry to the work entry even when no
   branch or PR signal matches. Omit it when unset.
3. Call `log_work_github` with `{ remotes, issueNumber, args, sessionId? }`.
4. Report back from `resolved`: repo, project name, date, duration, how many
   agent sessions were linked (`linkedAgentEntryIds`), and — if `degraded`
   is true — that issue metadata was unavailable (see the fallback below).
5. On error, surface the server's message verbatim: it contains the fix
   (grammar examples, or where to add the repo mapping).

### Degraded fallback: fill the title with the local `gh` CLI

When `resolved.degraded` is true, the server could not read the issue (no
App, or its installation does not cover this repo), so the description is
the bare `#N`. If the `gh` CLI is available, recover the title
automatically — best-effort, never failing the log itself:

1. Fetch the title with `gh api repos/<resolved.repo>/issues/<N> --jq .title`
   (the Issues API answers for PR numbers too; use `resolved.repo` from the
   response — do not re-resolve the repo yourself).
2. On success, call `update_entry` setting the description to
   `<title> (#N)` — the same shape the server writes when metadata is
   available, so degraded and non-degraded entries look uniform.
3. On any failure (`gh` missing, unauthenticated, no access), leave the
   entry as `#N` and report the degraded state as before.

When the fallback fills the title, say so in the summary: the title came
from the local `gh` CLI because the App cannot read this repo — installing
the App on the repo's account remains the real fix (the fallback cannot
recover server-side features like branch→PR agent-session linking or
webhook-driven logging).

## Logging

1. Resolve ids: `list_workspaces`, then `list_projects` for the chosen
   workspace. If the workspace or project is ambiguous, present the options
   and ask instead of guessing.
2. Create the entry with `log_work` (`durationMinutes`, `description`,
   optional `entryDate`, `note`, `tags`). When the entry records the
   current session's work, read `$SPANTAIL_SESSION_ID` (exported by this
   plugin's SessionStart hook) and pass it as `sessionId` so the server
   links this session's agent entry; do not pass it when logging unrelated
   past work. For several entries at once (e.g. "log everything I did
   today"), use `log_work_batch`.
3. Report back what was logged: date, project, duration, description. When
   you passed `sessionId`, say the current session link was requested — it
   is best-effort (the server links only telemetry that has already been
   ingested) and `log_work`'s response does not carry the outcome, so do
   not assert that it happened.

## Privacy

The description and note are stored verbatim and can appear in reports,
public share links, and sent copies. Never put secrets, tokens, or private
personal data in them. The degraded-title fallback stores, via your
personal `gh` credential, an issue title the instance's App is not entitled
to read — the same trust level as a hand-typed description, but visible to
workspace members like any other entry.
