---
title: GitHub integration
description: Register the instance's GitHub App, install it, map repositories to projects, and let members connect their GitHub accounts.
---

The GitHub integration lets your team log work without leaving GitHub:

- **From a comment** — `@spantail 2h yesterday` on any issue or pull request logs a work
  entry against the mapped project. The bot reacts with 👍 and replies with the running
  total on that issue.
- **From Claude Code** — `/spantail:log-work #123 2h` logs against a GitHub issue; the
  server fills in the issue title and labels and links matching agent sessions.

Four pieces make this work, in setup order: the **App** (instance admin, once), an
**installation** (repo owner, once per account/org), **repo mappings** (workspace admins),
and each member's **GitHub connection** (self-service).

## 1. Register the App (instance admin)

**Settings → System → GitHub.** Every Spantail instance registers its **own** GitHub App —
webhooks must point at your instance's URL, so there is no shared central App to install.

1. Choose the **owner**: your personal account, or an organization you belong to. The owner
   decides which repositories the App can later be installed on.
2. Click **Register on GitHub**. GitHub shows the App being created (via the
   [App Manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest));
   approve it.
3. GitHub sends the new App's credentials straight back to your instance — the private key,
   webhook secret, and client secret are received automatically and stored encrypted. There
   is nothing to copy or paste.

The App is always **private** to its owner, requests only the permissions the integration
needs (issue/PR read-write, metadata read), and its webhook is pinned to your instance.

## 2. Install it

After registration GitHub immediately asks where to **install** the App — pick the account
or organization whose repositories you want to log work from, and select repositories.
Later installs are done from the App's GitHub page (linked from the settings screen).
Installations appear on **Settings → System → GitHub** as webhooks arrive.

## 3. Map repositories to projects (workspace admin)

**Settings → Workspace → Integrations.** A mapping says "work logged from this repository
belongs to this project". Mappings are the single source of truth — the Claude Code plugin
never stores a project id.

- **From an installation** — repositories the App can reach appear under *Unmapped
  repositories*; pick a project for each one you want.
- **Manually** — add any `owner/repo` by name. This works **without the App**: the `#N`
  log-work form keeps working (entries then carry just the issue link, without title and
  labels), while comment commands need the App.

One repository maps to one project across the whole instance.

## 4. Connect your GitHub account (every member)

**Settings → Account → Authentication → GitHub for work logging.** Commenting
`@spantail …` only logs work when Spantail knows *which user* the GitHub account belongs
to. Each member clicks **Connect GitHub** once and approves on GitHub — the authorization
only proves account ownership; it grants no repository access and is never a sign-in
method. The first time an unconnected repo member posts a command, the bot replies with
this connect link.

## Using it

On any issue or PR of a mapped repository, comment:

```text
@spantail <duration> [date]
```

- **Duration**: `30m`, `2h`, `1h30m`, `3.5h`, or plain minutes (`90`).
- **Date** (optional): `today` / `yesterday`, `2026-07-05` (ISO), or `7/5` (month/day; the
  year completes to the most recent match at or before today). Omitted means today — in
  **your** timezone, from your account preferences.

The entry gets the issue title as its description, the issue labels as tags, and a link
back to the issue. Recent agent sessions on that repository whose branch or PR points at
the issue are attached automatically.

Commands are executed only for connected workspace members. On public repositories the
bot deliberately ignores everyone else — no replies to outsiders.

## Removing pieces

- **Uninstall / suspend** (on GitHub) — comment commands stop for those repos; mappings
  and history stay.
- **Remove the App configuration** (Settings → System → GitHub) — mappings survive, so
  `#N` log-work keeps working in the degraded, link-only form.
- **Disconnect GitHub** (member) — their comments stop logging until reconnected.
