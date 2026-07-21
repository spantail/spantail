---
title: GitHub Integration
description: Log work from a GitHub issue or pull request by commenting @spantail, and from Claude Code with an issue number.
---

The **GitHub integration** logs work where it happens. Comment `@spantail 2h` on
an issue or a pull request and Spantail records a work entry against the project
that repository is mapped to — with the issue title as the description, its
labels as tags, and a link back to the issue.

Setting it up is an administrator's job: an instance admin registers the GitHub
App and a workspace admin maps repositories to projects. See
[GitHub integration](/admin/github-integration/) for that side, or
[Setup GitHub Integration](/getting-started/github/) for the hands-on
walkthrough. This page is what you need once it is wired up.

## Connect your GitHub account

Spantail logs the entry against *you*, so it has to know which Spantail user a
GitHub login belongs to. Open **Settings → Account → Authentication**, find
**GitHub for work logging**, and click **Connect GitHub**.

The authorization only proves you own the account. It grants no repository
access and is never a way to sign in. Comment before connecting and the bot
replies with the connect link instead of logging anything.

## Log work from a comment

On any issue or pull request of a mapped repository:

```text
@spantail <duration> [date]
```

- **Duration** — `30m`, `2h`, `1h30m`, `3.5h`, or plain minutes (`90`).
- **Date** *(optional)* — `today`, `yesterday`, `2026-07-05` (ISO), or `7/5`
  (month/day; the year completes to the most recent match at or before today).
  Omitted means today, in the timezone from your
  [account preferences](/guides/account-preferences/).

Spantail reacts with 👍 and replies with the running total for that issue:

```text
✅ Logged 2h on 2026-07-05 (total on this issue: 3.5h)
```

Recent [agent sessions](/guides/capturing-agents/) on that repository whose
branch or pull request points at the issue are attached to the entry
automatically, and the titles of the attached sessions are appended to the
entry's note.

Get the grammar wrong and the bot says how to fix it. On a public repository it
deliberately stays silent for anyone who is not an owner, member, or
collaborator of the repository.

## Log work from Claude Code

With the [Claude Plugin](/guides/tools/claude-plugin/):

```text
/spantail:log-work #123 2h
```

The server resolves the project from the repository's mapping, fills in the
issue title and labels, and links matching agent sessions — the same entry you
would get from a comment, with one addition: the Claude Code session you run
the command from is always linked, even when no branch or pull request points
at the issue. This form works even when the instance has no GitHub
App registered; the entry then carries just the issue link, without the title
and labels.

## When it stops working

- **Nothing happens on your comment** — your GitHub account is not connected, or
  you are not a member of the workspace the repository maps to.
- **The bot never replies** — the repository has no mapping, or the App is not
  installed on it. Ask a workspace admin to check
  **Settings → Workspace → Integrations**.
- **You disconnect GitHub** — your comments stop logging until you reconnect.
  Entries you already logged stay.
