---
title: CLI
description: spantail コマンドラインクライアント。
---

`spantail` はコマンドラインクライアントです。稼働中の Spantail インスタンスの REST API と
通信するので、Web アプリと同じこと — 作業の記録、記録の一覧、レポートの実行 — をターミナルや
スクリプトから行えます。

## インストール

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
spantail report run <report-id> > weekly.md
```

| コマンド | 説明 |
|---|---|
| `spantail auth login` | 資格情報を検証して保存（非対話用に `--server`、`--token`）。 |
| `spantail auth status` | 現在の接続とサインイン中のユーザーを表示。 |
| `spantail auth logout` | 保存した資格情報を削除（トークン自体は有効なまま）。 |
| `spantail workspaces list` | 所属するワークスペースを一覧。 |
| `spantail projects list` | ワークスペース内のプロジェクトを一覧。 |
| `spantail log <description>` | 作業記録を作成（`--project`、`--duration`、`--date`、`--note`、`--tag`）。 |
| `spantail entries list` | 最近の作業記録を一覧（`--project`、`--from`、`--to`、`--limit`）。 |
| `spantail report list` | 保存済みレポートを ID 付きで一覧。 |
| `spantail report run <id>` | レポートを実行。Markdown は標準出力、状態は標準エラーへ。 |
| `spantail mcp` | AI クライアント向けの stdio [MCP](/ja/guides/tools/mcp/) サーバーを実行。 |

各オプションの詳細は `spantail <command> --help` を実行してください。所要時間は分、または
時間／分の形式を受け付けます: `90`、`90m`、`2h`、`1h30m`。

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
