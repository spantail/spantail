---
title: CLI
description: spantail コマンドラインクライアント。
---

`spantail` はコマンドラインクライアントです。稼働中の Spantail インスタンスの REST API と
通信するので、Web アプリと同じこと — 作業エントリの作成・管理、レポートの作成・送信・共有・
ディスカッション、受信トレイの確認 — をターミナルやスクリプトから行えます。管理業務（ユーザー、
ワークスペース、プロジェクト、テンプレート）は Web アプリで行います。

## インストール

```bash
npm install -g spantail
```

Node.js 24 以降が必要です。インストールせずに一度だけ実行するには、`spantail` の代わりに
`npx spantail` を使います。

CLI は Spantail サーバとは独立にバージョニング・リリースされるため、CLI のバージョン番号は
インスタンスのバージョンとは無関係です。両者が接するのは REST API だけで、API は追加のみで
成長します。したがって新しいサーバは常に古い CLI で動きます。逆向きは機能が足りないことが
あるため、CLI は動作確認されている最も古いサーバより古いサーバに接続すると警告を表示します。
警告するだけで、ほとんどのコマンドはそのまま動きます。

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
| `spantail search <query>` | 作業エントリとレポートを横断検索。 |
| `spantail mcp` | AI クライアント向けの stdio [MCP](/ja/guides/tools/mcp/) サーバーを実行。 |

### 作業エントリ

| コマンド | 説明 |
|---|---|
| `spantail log <description>` | 作業エントリを作成（`--project`、`--duration`、`--date`、`--note`、`--tag`）。 |
| `spantail entries list` | 最近の作業エントリを一覧（`--project`、`--from`、`--to`、`--limit`）。 |
| `spantail entries view <id>` | 作業エントリ 1 件の全項目を表示。 |
| `spantail entries edit <id>` | 自分の作業エントリを更新（渡したフラグだけが変わります）。 |
| `spantail entries delete <id>` | 自分の作業エントリを削除（`--yes` がなければ確認）。 |
| `spantail entries stats` | 合計と日別／プロジェクト別／ユーザー別の集計。 |
| `spantail entries tags` | スコープ内のタグを 1 行 1 つで一覧。 |
| `spantail entries import <file.jsonl>` | JSONL ファイルから作業エントリを一括インポート（`--workspace`、`--project`、`--user`、`--dry-run`）。 |

#### 一括インポート（JSONL）

`spantail entries import` は、別のシステムから作業エントリを移行するための
コマンドです。ファイルは 1 行につき 1 つの JSON オブジェクトです。

```json
{"project":"website","entryDate":"2024-07-15","durationMinutes":90,"description":"オンボーディングフローをレビュー","tags":["review"]}
```

各行のフィールド: `entryDate`（必須 — 日付は値のまま使われ、タイムゾーン
変換は行われません）、`durationMinutes`、`description`、および任意の
`project`（スラッグ。ない行は `--project` を使用）、`user`（作成者のメール
アドレス。ない行は `--user` を使用）、`note`、`tags`、`startedAt`、`endedAt`、
`externalId`。

既定では各エントリの作成者はあなた自身です。`user` フィールド（または
`--user`）はメールアドレスで別のアカウントにエントリを帰属させます — チーム
全体の履歴を 1 回でインポートする方法です — が、自分以外の作成者を指定できるの
は**インスタンス管理者**のみで、そのメールは対象ワークスペースのメンバーで
なければなりません。管理者以外は自分のエントリしかインポートできません。

まずファイル全体を検証します — 不正な行が 1 つでもあれば、何も送信する前に
行番号付きで失敗します。その後、エントリは 100 件ずつのアトミックなバッチで
送信されます（各リクエストは全件成功か全件失敗）。`--dry-run` を使うと、
インポートせずに検証とプロジェクトスラッグ・作成者メールの解決だけを行えます。

`externalId` は通常は省略します。移行元システムの ID を保持したい場合に
指定すると、その値がエントリの id になり（インスタンス全体でユニーク、
使える文字は `A-Za-z0-9._:-`、弱い ID には `legacy-123` のようにプレフィックス
を付けてください）、同じファイルを再インポートしたときに該当エントリは
重複ではなく更新になります。`externalId` のない行は再インポートで重複します。

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
| `spantail report send <id>` | 凍結スナップショットを受信トレイに送信（`--to`、`--self`、`--message`）。 |
| `spantail report sends <id>` | 送信履歴を既読数付きで表示。 |
| `spantail report share <id>` | 公開共有リンクを作成（`--expires-in`、`--passcode`）。 |
| `spantail report shares <id>` | 共有リンクと状態を一覧。 |
| `spantail report unshare <share-id>` | 共有リンクを失効。 |
| `spantail report discussion <id>` | スレッドのリアクションとコメントを表示。`<id>` はレポート ID（現行バージョン）か、受信者の場合は受信トレイのメッセージ ID（配信されたバージョン）。 |
| `spantail report comment <id> <body>` | コメントを追加（自分のものは `--edit`/`--delete`）。 |
| `spantail report react <id> <emoji>` | 現行バージョンやコメントへのリアクションを切り替え（`--comment`）。 |

### 受信トレイ

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
