---
title: Migration from other products
description: Move your history from another tool into Spantail with an AI coding agent driving the MCP and CLI tools.
---

Spantail ships **no product-specific migration tool or runbook** — there is no "import from
tool X" wizard for any particular source system. Instead you migrate with Spantail's own
tools, the [MCP server](/guides/tools/mcp/) and the [CLI](/guides/tools/cli/), driven by an AI
coding agent such as [Claude Code](/guides/tools/claude-plugin/). The agent adapts to whatever
shape your export happens to be, so no fixed format is required on either side.

Only **work entries** move in bulk this way; **agent activity** is never imported — it starts
flowing the moment you connect an agent.

## Export from your current tool

Get your data out of the source system first. Anything it can produce works: a database dump,
CSV exports, or a JSON/JSONL API dump. One file per table (or per entity) is easiest to reason
about, since each maps to one step below.

## Import table by table, in dependency order

Spantail's entities nest — a workspace contains projects, and a work entry lives under a
workspace and references its project by **slug** and its author by **email**. Import **parents
before children**: a child resolves its parent by slug or its author by email, and Spantail
never creates a missing parent for you (an unknown project slug fails the run and prints the
slugs that do exist). Point Claude Code at your exported files and work through the tables in
this order — an example prompt for each step:

1. **Workspaces** — create the destination workspaces first.

   > Read `departments.csv` and create one Spantail workspace per row through the API. Print
   > each workspace's name, id, and slug.

2. **Projects** — then the projects inside each workspace. Set slugs that match (or map cleanly
   onto) your source system's identifiers, since the entry import resolves projects by slug.

   > For every row in `projects.csv`, create a project in the workspace named in its
   > `department` column. Use the `key` column as the project slug.

3. **People** — provision every person's account before importing their entries (see
   [below](#people-provision-accounts-up-front)).

   > From `users.csv`, list the accounts to create (name, email). For email/password sign-in,
   > generate a temporary password per person so they can sign in before the import.

4. **Work entries** — import last, as an instance admin so the whole team's history lands in one
   pass.

   > Convert `time-logs.csv` to the JSONL bulk-import format: map each row to its project slug
   > and its author's email, set `externalId` to the source row's id, then import it — `--dry-run`
   > first.

5. **Agent activity** — not migrated. Point your agents at the instance with the
   [agent capture guide](/guides/capturing-agents/) and sessions start flowing from that point on.

## People: provision accounts up front

You do **not** need each person to sign in and import their own history. Prepare the destination
accounts first, then import everyone's entries together. Because the accounts already exist when
the entries land:

- A **social login** (e.g. Google) matches the account by email at first sign-in — the person
  signs straight in, with no separate sign-up.
- An **email/password** login has nothing to match against, so have the admin set a **temporary
  password** for each account up front and hand it out.

With the accounts in place, an **instance admin** runs the entry import once for the whole team.
Each line carries its author's email in a `user` field (lines without one fall back to `--user`),
so every entry is attributed to the right person rather than to the admin who ran the import.

## Let Claude Code do the conversion

Point Claude Code at your exported files and at Spantail's MCP server (or the CLI), and have it
map each source table onto the matching step above. How it imports depends on the volume:

- **Small datasets** — let the agent read the export and call the MCP or CLI tools directly,
  record by record (`log_work`, or `log_work_batch` for up to 100 at a time). No scripting
  needed.
- **Large datasets** — have the agent write a small conversion script that transforms each dump
  into the [JSONL bulk-import format](/guides/tools/cli/#bulk-import-jsonl), then run
  `spantail entries import`. Entries post in atomic batches, so thousands of rows land reliably
  and a failed batch can be re-run.

Whichever path you take, set each entry's `externalId` to its id in the old system. That makes
the import **idempotent** — re-running the same data updates those entries instead of
duplicating them — so you can rehearse against a subset, fix the mapping, and run the full set
without fear. Rehearse a JSONL import with `--dry-run`, which validates every line and resolves
every project slug (and author email) before writing anything:

```bash
spantail entries import work-entries.jsonl --workspace acme --dry-run
```

See [Bulk import (JSONL)](/guides/tools/cli/#bulk-import-jsonl) for the field reference the agent
should target.
