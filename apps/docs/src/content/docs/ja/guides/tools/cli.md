---
title: CLI
description: spantail コマンドラインクライアント。
---

`spantail` はコマンドラインクライアントです。稼働中の Spantail インスタンスの REST API と
通信するので、Web アプリと同じこと — 作業記録の作成・管理、レポートの作成・送信・共有・
ディスカッション、受信箱の確認 — をターミナルやスクリプトから行えます。管理業務（ユーザー、
ワークスペース、プロジェクト、テンプレート）は Web アプリで行います。

## インストール

:::caution[まだ未公開]
`spantail` CLI はまだ npm に公開されていません。下のコマンドは公開後に使えるように
なります。それまでは[モノレポ](https://github.com/spantail/spantail)の `packages/cli`
からビルドしてください。
:::

```bash
npm install -g spantail
```

Node.js 24 以降が必要です。

## サインイン

1. Web アプリの**設定 → API トークン**で API トークンを作成します（read と write スコープで
   十分）。[アカウントと設定](/ja/guides/account-preferences/)を参照してください。
2. ログインして既定のワークスペースを選びます。

```bash
spantail auth login
# Server URL: https://spantail.example.com
# API token: （貼り付け — 入力は非表示）
```

資格情報は `~/.config/spantail/config.json`（モード `0600`）に保存されます。

## 主なコマンド

```bash
spantail log "Fixed the build" --project website --duration 1h30m --tag ci
spantail entries list --from 2026-06-01 --to 2026-06-30
spantail report create --template <template-id> --range last-week
spantail report view <report-id> > weekly.md
spantail report send <report-id> --to teammate@example.com --message "FYI"
```

### 接続と検索

| コマンド | 説明 |
|---|---|
| `spantail auth login` | 資格情報を検証して保存（非対話用に `--server`、`--token`）。 |
| `spantail auth status` | 現在の接続とサインイン中のユーザーを表示。 |
| `spantail auth logout` | 保存した資格情報を削除（トークン自体は有効なまま）。 |
| `spantail workspaces list` | 所属するワークスペースを一覧。 |
| `spantail projects list` | ワークスペース内のプロジェクトを一覧。 |
| `spantail search <query>` | 作業記録とレポートを横断検索。 |
| `spantail mcp` | AI クライアント向けの stdio [MCP](/ja/guides/tools/mcp/) サーバーを実行。 |

### 作業記録

| コマンド | 説明 |
|---|---|
| `spantail log <description>` | 作業記録を作成（`--project`、`--duration`、`--date`、`--note`、`--tag`）。 |
| `spantail entries list` | 最近の作業記録を一覧（`--project`、`--from`、`--to`、`--limit`）。 |
| `spantail entries view <id>` | 作業記録 1 件の全項目を表示。 |
| `spantail entries edit <id>` | 自分の記録を更新（渡したフラグだけが変わります）。 |
| `spantail entries delete <id>` | 自分の記録を削除（`--yes` がなければ確認）。 |
| `spantail entries stats` | 合計と日別／プロジェクト別／ユーザー別の集計。 |
| `spantail entries tags` | スコープ内のタグを 1 行 1 つで一覧。 |

### レポート

| コマンド | 説明 |
|---|---|
| `spantail report templates` | レポートテンプレートを ID 付きで一覧。 |
| `spantail report create` | テンプレートとフィルタからレポートを作成（`--template`、`--range` または `--from`/`--to`、`--project`、`--user`、`--tag`）。 |
| `spantail report preview` | 保存せずにレポートを描画。 |
| `spantail report list` | 保存済みレポートを ID 付きで一覧。 |
| `spantail report view <id>` | レポートの描画済み Markdown を標準出力に表示（状態は標準エラーへ）。 |
| `spantail report edit <id>` | 変更したフィールドで再描画（省略したフラグは現在値を維持）。 |
| `spantail report delete <id>` | レポートを削除（`--yes` がなければ確認）。 |

### 送信・共有・ディスカッション

| コマンド | 説明 |
|---|---|
| `spantail report recipients <id>` | レポートの送信先候補を一覧。 |
| `spantail report send <id>` | 凍結スナップショットを受信箱に送信（`--to`、`--self`、`--message`）。 |
| `spantail report sends <id>` | 送信履歴を既読数付きで表示。 |
| `spantail report share <id>` | 公開共有リンクを作成（`--expires-in`、`--passcode`）。 |
| `spantail report shares <id>` | 共有リンクと状態を一覧。 |
| `spantail report unshare <share-id>` | 共有リンクを失効。 |
| `spantail report discussion <id>` | レポートのリアクションとコメントを表示。 |
| `spantail report comment <id> <body>` | コメントを追加（自分のものは `--edit`/`--delete`）。 |
| `spantail report react <id> <emoji>` | レポートやコメントへのリアクションを切り替え（`--comment`）。 |

### 受信箱

| コマンド | 説明 |
|---|---|
| `spantail inbox list` | メールボックスのフォルダを一覧（`--folder inbox\|starred\|sent\|archive\|trash`）。 |
| `spantail inbox view <id>` | 受信したレポートのスナップショットを表示（既読にはしません）。 |
| `spantail inbox counts` | フォルダ別件数（未読数を含む）。 |
| `spantail inbox read <id>` / `unread <id>` / `read-all` | 既読状態を管理。 |
| `spantail inbox flag <id>` | スター／アーカイブ／ゴミ箱を切り替え（送信バッチは `--sent`）。 |

各オプションの詳細は `spantail <command> --help` を実行してください。所要時間は分、または
時間／分の形式を受け付けます: `90`、`90m`、`2h`、`1h30m`。破壊的なコマンドは確認を求めます。
スクリプトでは `--yes` を渡してください。

## 設定

ワークスペースが必要なコマンドは `--workspace <slug>` を使い、指定がなければログイン時に
選んだ既定にフォールバックします。環境変数は設定ファイルを上書きします。

| 変数 | 意味 |
|---|---|
| `SPANTAIL_API_URL` | インスタンスのベース URL。 |
| `SPANTAIL_API_TOKEN` | API トークン。 |
| `SPANTAIL_CONFIG_DIR` | 別の設定ディレクトリ。 |

## AI クライアントで使う

`spantail mcp` は、リモート MCP サーバーに対応しない AI クライアント向けに、Spantail の
ツールを stdio で提供します。[MCP](/ja/guides/tools/mcp/) を参照してください。
