---
name: link
description: Link this repository to a Spantail workspace and project so its
  agent sessions are attributed there. Use when the user wants to set or
  change where this repo's sessions are recorded in Spantail.
---

Write this repository's Spantail attribution — which workspace and project
its agent sessions are recorded against — into a repo-level config file that
the plugin's telemetry hooks read.

## Target file

- Default: `.spantail/config.local.json` — personal, must stay out of git.
- `$ARGUMENTS` contains `--shared`: `.spantail/config.json` — committed, so
  every collaborator who installs the plugin inherits the attribution.

Both live at the repository root (`git rev-parse --show-toplevel`). Write
only `workspaceId` and — optionally — `projectId`; the hooks ignore every
other key there (`apiUrl` and tokens never resolve from a repo file).

## Steps

1. If a target file already exists, read it and show the current link before
   changing it.
2. Resolve the workspace and project. Prefer the Spantail MCP tools:
   `list_workspaces`, then `list_projects` for the chosen workspace. If
   `$ARGUMENTS` names a workspace/project (by name or id), match against
   those lists; otherwise present the options and ask. If the MCP tools are
   unavailable (no `apiToken` configured), ask the user for the ids — they
   can copy them from the Spantail workspace switcher and project list.
3. Write the file (create `.spantail/` if needed), e.g.:

   ```json
   { "workspaceId": "<id>", "projectId": "<id>" }
   ```

   `projectId` may be omitted to link the workspace only.
4. For `.spantail/config.local.json`: ensure the repository's `.gitignore`
   contains a `.spantail/config.local.json` line (append it, creating
   `.gitignore` if missing; skip when already covered). For the shared file:
   remind the user to commit it.
5. Confirm the result: file written, workspace/project (name and id), and
   that precedence is env `SPANTAIL_*` > the local file (which replaces the
   shared file entirely while it exists) > the shared file > the
   user-global plugin config. Suggest `/spantail:doctor` to verify the
   effective resolution.
