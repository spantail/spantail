---
title: Claude Plugin
description: Capture Claude Code activity (coming soon).
---

:::caution[Coming soon]
The Claude plugin is not available yet. This page is a placeholder for when it
ships.
:::

A dedicated **Claude Code plugin** is planned to capture Claude Code sessions as
agent activity automatically, with no manual setup beyond connecting it to your
instance.

In the meantime:

- To capture **agent activity** (sessions and token usage), send it to the
  ingest API with an agent access token — see
  [Capturing agent activity](/guides/capturing-agents/).
- To let Claude Code **log work and read reports as you** (not the same as agent
  capture), connect it over MCP with `claude mcp add spantail -- spantail mcp` —
  see [MCP](/guides/tools/mcp/).
