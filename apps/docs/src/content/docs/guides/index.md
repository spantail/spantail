---
title: User Guide overview
description: What Spantail records, and where to find the page that covers the part you need.
---

Spantail is a work observability platform. It records what people do as **work
entries**, captures AI-agent activity as **agent sessions**, and turns both into
**reports** you can send, share, and discuss. It is self-hosted — one
deployment, on your own Cloudflare account, serving one organization.

This guide is for everyone who uses Spantail day to day. Managing workspaces,
projects, members, and instance settings lives in the
[Admin Guide](/admin/); deploying and operating the instance lives in the
[Setup Guide](/self-hosting/).

## The vocabulary

These are the words Spantail uses, in the app and throughout this documentation.

| Term | What it is |
|---|---|
| **Workspace** | An organizational unit (a team, department, or client). You can belong to several. |
| **Project** | A subdivision of a workspace. Work entries can be assigned to a project or left workspace-wide. |
| **Work entry** | A record of human work: a date, duration, description, optional note, and tags. You **log work** to create one. |
| **Agent** | An AI coding agent you registered, acting for you. |
| **Agent session** | One run of an agent, captured automatically and shown on the timeline alongside human work. **Agent activity** is the collective term. |
| **Report** | A snapshot built from a template, filters, and a date range — readable, shareable, and discussable. |
| **Share link** | A read-only link to a report, for people outside Spantail. Creating one is **sharing** the report. |
| **Message** | Something delivered to you inside Spantail — today, a report someone **sent** you. Messages sit in **folders**: Inbox, Starred, Sent, Archive, Trash. |

## Start here

New to Spantail? The Getting started hands-on takes you from an empty Cloudflare
account to a report in your inbox, then wires up the two places work already
happens.

- [Quick start](/getting-started/) — deploy an instance, log a day of
  work, and send yourself the report.
- [Setup Claude Plugin](/getting-started/claude-code/) — capture your
  Claude Code sessions automatically.
- [Setup GitHub Integration](/getting-started/github/) — log work by
  commenting on an issue.

## What this guide covers

**Core features** — the web app, day to day:

- [Logging work](/guides/logging-work/) — record and edit work entries.
- [Projects & timeline](/guides/projects-timeline/) — browse projects and your
  work timeline.
- [Reports & messages](/guides/reports/) — create, send, share, and discuss reports.
- [Capturing agent activity](/guides/capturing-agents/) — register agents and
  read their sessions.

**Your account** — settings that are yours alone:

- [Account & preferences](/guides/account-preferences/) — API tokens, language,
  theme, and timezone.
- [Keyboard shortcuts](/guides/keyboard-shortcuts/).

**Clients** — the same API from outside the web app:

- [CLI](/guides/tools/cli/) — the `spantail` command-line client.
- [MCP](/guides/tools/mcp/) — remote and stdio servers for AI clients.
- [Claude Plugin](/guides/tools/claude-plugin/) — capture Claude Code sessions,
  and log work from inside Claude Code.
- [GitHub Integration](/guides/tools/github-integration/) — log work from an
  issue or a pull request.

Automating Spantail directly over HTTP is covered in the
[API Reference](/api/).
