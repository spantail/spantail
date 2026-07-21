---
name: link
description: Link this repository to a Spantail workspace and project so its
  agent sessions are attributed there. Use when the user wants to set or
  change where this repo's sessions are recorded in Spantail.
---

Write this repository's Spantail attribution — which workspace and project
its agent sessions are recorded against — into a repo-level config file that
the plugin's telemetry hooks read.

Be fast: no MCP calls, no repository exploration, no extra verification.
The whole flow is read the existing config (if any) → ask → write →
`git check-ignore` → a short confirmation. Nothing else.

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
2. Get the ids. If `$ARGUMENTS` contains them (first id → `workspaceId`,
   second → `projectId`), use them as-is — do not resolve names to ids or
   look anything up. Otherwise ask with a single AskUserQuestion call, two
   questions:
   - **Workspace ID** (required). Question text: paste the workspace id —
     copy it with the copy button in the sidebar's workspace switcher.
     Options: "Keep current: `<id>`" when a link exists, "Where do I find
     it?" when none does, plus "Cancel — leave unchanged"; a new id comes
     in via Other. On "Where do I find it?", describe the copy button's
     location and ask again.
   - **Project ID** (optional). Question text: paste the project id — copy
     it with the copy button next to the project in the sidebar. Options:
     "No project — workspace only", "Keep current: `<id>`" when the link
     has one, plus "Cancel — leave unchanged"; a new id comes in via
     Other.

   Check only the format of a pasted id — 1–64 chars of `[A-Za-z0-9._-]`,
   the same constraint the hooks enforce — and re-ask on a mismatch. Do not
   verify ids against the server.
3. Write the file (create `.spantail/` if needed), e.g.:

   ```json
   { "workspaceId": "<id>", "projectId": "<id>" }
   ```

   `projectId` may be omitted to link the workspace only.
4. For `.spantail/config.local.json`: from the repository root, run
   `git check-ignore -q .spantail/config.local.json` (a cwd-relative path
   would test the wrong file from a subdirectory); if it is not ignored,
   tell the user to add `.spantail/config.local.json` to `.gitignore` or
   `.git/info/exclude` — do not edit either file yourself. For the shared
   file: remind the user to commit it.
5. Confirm the result: file written, the ids, and that precedence is env
   `SPANTAIL_*` > the local file (which replaces the shared file entirely
   while it exists) > the shared file > the user-global plugin config.
   Suggest `/spantail:doctor` to verify the effective resolution.
