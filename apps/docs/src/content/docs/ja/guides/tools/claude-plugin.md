---
title: Claude プラグイン
description: Claude Code のセッションを捕捉し、Claude Code から Spantail を操作。
---

**Claude Code 向け Spantail プラグイン**は、Claude Code のセッションを
[エージェント活動](/ja/guides/capturing-agents/)として自動で取り込み、さらに
Claude Code の中から作業を記録しレポートを作るためのスキルとエージェントを追加します。

Claude Code v2.1.143 以降が必要です。

## インストール

```
/plugin marketplace add spantail/spantail
/plugin install spantail@spantail
```

プラグインを有効化すると、インスタンスの URL と**エージェントアクセストークン**
（先に[エージェントを登録](/ja/guides/capturing-agents/)してください）、任意の
ワークスペース ID / プロジェクト ID の入力を求められます。各設定は環境変数
（`SPANTAIL_API_URL`、`SPANTAIL_AGENT_TOKEN`、`SPANTAIL_WORKSPACE_ID`、
`SPANTAIL_PROJECT_ID`、`SPANTAIL_SEND_SESSION_SUMMARY`）で上書きでき、環境変数が
優先されます。

フックの動作には `bash`・`jq`・`curl` が `PATH` に必要です。フックがターンを失敗
させたり、セッションの終了を妨げたりすることはありません。問題があれば stderr に
ログを残してスキップします。

## 送信される内容

プラグインのフックが送るのは**コンパクトなテレメトリのみ**です。会話本文・思考・
ツールの入出力がマシンの外に出ることはありません。

- 毎回の **Stop**（ターン終了）で: ターンごとのトークン使用量・タイムスタンプ・
  モデル名に加え、git ブランチ・リポジトリ URL・作業ディレクトリ・Claude Code の
  バージョン・プロバイダのリクエスト ID を
  [イベント属性](/ja/api/agent-ingest/)として送ります。
- **SessionEnd** で: イベントの最終再送（冪等）に続けて、実時間の終了時刻と
  セッションが触れたプルリクエスト（`context.refs`）を
  [finalize](/ja/api/agent-ingest/) に送ります。

1 つだけオプトインの項目があります。`sendSessionSummary` 設定（または単一セッション
なら `/spantail:summary on`）を有効にすると、SessionEnd フックはそのセッションの
**プランファイルのタイトル**をエントリの説明として送ります。タイトルは transcript の
構造化された plan mode レコードから機械的に抽出され、追加の推論は行いません。
plan mode を使ったセッションだけが対象で、それ以外では説明は空のままです。
他の説明と同様そのまま保存されてレポートや共有リンクに表示され得るため、
自分で有効にしない限りオフのままです。

## スキルとエージェント

| 名前 | 用途 |
|---|---|
| `/spantail:log-work` | 作業記録を作成 — 指示した内容からも、現在のセッションの作業内容からも。 |
| `/spantail:create-report` | レポートを作成。保存前に必ずプレビューします。 |
| `/spantail:summary on\|off` | セッション単位で、プランタイトルを説明として送るかを切り替え。 |
| `spantail-work-analyst`（エージェント） | 作業記録のふりかえり分析。 |
| `spantail-agent-activity-analyst`（エージェント） | エージェントのセッションテレメトリ分析。 |

スキルと分析エージェントは**あなたとして**動くため、個人用 API トークンによる
[Spantail MCP 接続](/ja/guides/tools/mcp/)が必要です（フックの書き込み専用エージェント
トークンとは別の資格情報です）。

```bash
claude mcp add spantail -- spantail mcp
```

MCP サーバーはあえてプラグインに同梱していません。フックだけ使う場合は CLI の
インストールは不要です。

## プラグインを使わない場合

フックのスクリプトは、`settings.json` に手動で配線し `SPANTAIL_*` 環境変数を設定すれば
単体でも動きます。手順は
[プラグインの README](https://github.com/spantail/spantail/tree/main/plugins/claude-code)
を参照してください。プログラムから直接送るには
[取り込み API](/ja/api/agent-ingest/) を使います。
