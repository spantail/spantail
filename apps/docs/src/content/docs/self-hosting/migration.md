---
title: Migration
description: Move existing work entries and workflows from another system into Spantail.
---

Once your instance is running, you can bring your history with you. Existing **work entries**
move in bulk from a JSONL file with the [CLI](/guides/tools/cli/); **agent activity** is not
imported — it starts flowing the moment you connect an agent.

## Before you start

1. Create the destination [workspace and its projects](/admin/projects/). Import resolves
   projects by **slug** and never creates them: an unknown slug fails the run and prints the
   slugs that do exist.
2. [Install the CLI and sign in](/guides/tools/cli/#install) as the user the entries should
   belong to. Every imported entry is authored by the account behind the credentials, so a
   per-person history is imported once per person.

## Export to JSONL

Convert your source system's export into a file with **one JSON object per line**:

```json
{"project":"website","entryDate":"2024-07-15","durationMinutes":90,"description":"Reviewed onboarding flow","tags":["review"],"externalId":"legacy-4711"}
```

`entryDate` is required and taken verbatim — it is a local date in the author's timezone, never
converted. `project` is a slug and may be omitted on lines covered by the `--project` flag. See
[Bulk import (JSONL)](/guides/tools/cli/#bulk-import-jsonl) for every field.

### Keep your source ids

Set `externalId` to the id the entry had in the old system. It becomes the entry's Spantail id,
which makes the import **idempotent**: re-running the same file updates those entries instead of
duplicating them. That is what lets you rehearse a migration, fix the export, and run it again.
Lines without an `externalId` duplicate on every run.

Ids are unique across the instance and limited to `A-Za-z0-9._:-`, so prefix a bare number from
the old system (`4711` → `legacy-4711`) rather than importing it raw.

## Rehearse, then import

Validate the file and resolve every project slug without writing anything:

```bash
spantail entries import work-entries.jsonl --workspace acme --dry-run
```

The whole file is checked before the first request, so a bad line fails the run with its line
number and nothing is imported. When the dry run is clean, drop the flag:

```bash
spantail entries import work-entries.jsonl --workspace acme
```

Entries are posted in atomic batches, so a batch either lands completely or not at all. If a
later batch fails, fix the export and re-run the same file — with `externalId` set, the entries
that already landed are updated rather than duplicated.

## Agent activity

Agent sessions are captured as they happen and there is no bulk import for them. Point your
agents at the instance with the [agent capture guide](/guides/capturing-agents/), or post to the
[agent ingest API](/api/agent-ingest/) directly from your own tooling.
