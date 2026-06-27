---
title: Claude プラグイン
description: Claude Code の活動を捕捉（近日公開）。
---

:::caution[近日公開]
Claude プラグインはまだ利用できません。このページは提供開始時のためのプレースホルダーです。
:::

専用の **Claude Code プラグイン**を予定しています。Claude Code のセッションをエージェント
活動として自動で取り込み、インスタンスに接続する以外の手動設定を不要にする想定です。

それまでの間は、次のように使えます。

- **エージェント活動**（セッションやトークン使用量）を取り込むには、エージェントアクセス
  トークンで取り込み API に送信します — [エージェント記録](/ja/guides/capturing-agents/)を参照
  してください。
- Claude Code に**あなたとして作業を記録・レポートを閲覧**させる（エージェント活動の取り込みとは
  別物）には、`claude mcp add spantail -- spantail mcp` で MCP 接続します —
  [MCP](/ja/guides/tools/mcp/)を参照してください。
