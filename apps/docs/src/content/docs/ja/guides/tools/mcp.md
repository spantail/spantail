---
title: MCP
description: AI クライアント向けのリモート /mcp と stdio MCP サーバー。
---

Spantail は **Model Context Protocol (MCP)** に対応しているため、AI クライアントが自分の
ツールを通じて、作業記録の作成・管理、検索、レポートの作成・閲覧をあなたのインスタンスに
対して行えます。MCP は同じ REST API のクライアントなので、トークンと同じ権限に従います。

ツールセットは [CLI](/ja/guides/tools/cli/) より意図的に絞っています。対人的な副作用を
持つ操作 — レポートの送信、共有リンク、コメント、受信箱 — は人が起点になります。

## 2つの接続方法

- **リモートエンドポイント** — インスタンスは `<instance>/mcp` を HTTP で公開します。
  リモート MCP サーバーに対応したクライアントで使います。
- **stdio サーバー** — stdio サーバーしか対応しないクライアント向けに、[CLI](/ja/guides/tools/cli/)
  から `spantail mcp` をローカルで実行します。保存済みの CLI 資格情報を使います。

## 認証

MCP は**個人用 API トークン**（[設定 → API トークン](/ja/guides/account-preferences/)）で認証
し、Bearer トークンとして渡します。トークンはあなたとして、あなたの権限で動作します。

エージェントアクセストークンはここでは**使えません**。取り込み専用で、エージェント活動の送信
しかできず、MCP ツールの呼び出しには使えません。[エージェント記録](/ja/guides/capturing-agents/)
を参照してください。

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
| `log_work_batch` | 最大 100 件の作業記録を 1 回のアトミックなリクエストで作成（全件か 0 件か）。`externalId` 付きのエントリは重複せずアップサートされます。 |
| `list_entries` | 作業記録を一覧（任意のフィルタ付き）。 |
| `update_entry` | 自分の作業記録を更新。 |
| `delete_entry` | 自分の作業記録を削除。 |
| `search` | 作業記録とレポートをテキストで検索。 |
| `list_report_templates` | インスタンスのレポートテンプレートを一覧。 |
| `list_reports` | 保存済みレポートを一覧。 |
| `get_report` | レポートを取得（描画済みの Markdown を含む）。 |
| `preview_report` | テンプレート・スコープ・期間からレポートを保存せずに描画。 |
| `create_report` | レポートを作成（名前を省略するとテンプレートの提案名を採用）。 |
| `update_report` | 既存レポートを変更したフィールドで再描画（新しいバージョンを追加）。 |

### stdio 専用ツール

stdio サーバー（`spantail mcp`）は、ローカルのファイルシステムを読むツールを
追加で登録します — リモートの `/mcp` エンドポイントはサーバー上で動くため、
これらのツールは提供されません。

| ツール | 動作 |
|---|---|
| `import_work_entries` | ローカルの JSONL ファイルから作業記録を一括インポート（形式と挙動は [`spantail entries import`](/ja/guides/tools/cli/) と同じ）。 |
