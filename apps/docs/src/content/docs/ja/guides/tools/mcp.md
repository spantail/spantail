---
title: MCP
description: AI クライアント向けのリモート /mcp と stdio MCP サーバー。
---

Spantail は **Model Context Protocol (MCP)** に対応しているため、AI クライアントが自分の
ツールを通じて、作業の記録・記録の一覧・レポートの実行をあなたのインスタンスに対して行え
ます。MCP は同じ REST API のクライアントなので、トークンと同じ権限に従います。

## 2つの接続方法

- **リモートエンドポイント** — インスタンスは `<instance>/mcp` を HTTP で公開します。
  リモート MCP サーバーに対応したクライアントで使います。
- **stdio サーバー** — stdio サーバーしか対応しないクライアント向けに、[CLI](/ja/guides/tools/cli/)
  から `spantail mcp` をローカルで実行します。保存済みの CLI 資格情報を使います。

## 認証

MCP は **Bearer トークン**を使います。

- **個人用 API トークン**（[設定 → API トークン](/ja/guides/account-preferences/)）は、あなた
  として動作します。
- **エージェントアクセストークン**は、AI エージェントが自分の活動を報告するときに使います —
  [エージェント記録](/ja/guides/capturing-agents/)を参照してください。

## Claude Code で設定する

stdio サーバーは1行で登録できます。

```bash
claude mcp add spantail -- spantail mcp
```

直接 HTTP で接続する場合は、クライアントを `<instance>/mcp` に向け、トークンを Bearer
資格情報として指定します。

## 利用できるツール

| ツール | 動作 |
|---|---|
| `list_workspaces` | ワークスペースを一覧（ID を解決するため最初に呼びます）。 |
| `list_projects` | ワークスペース内のプロジェクトを一覧。 |
| `log_work` | 作業記録を作成。 |
| `list_entries` | 作業記録を一覧（任意のフィルタ付き）。 |
| `list_report_templates` | インスタンスのレポートテンプレートを一覧。 |
| `list_reports` | 保存済みレポートを一覧。 |
| `get_report` | レポートを取得（描画済みの Markdown を含む）。 |
| `update_entry` | 自分の作業記録を更新。 |
