---
title: 設定
description: 環境変数・シークレット・バインディング。
---

このページは Spantail インスタンスで設定するすべての項目のリファレンスです。デプロイの手順
そのものは [Cloudflare へデプロイ](/ja/self-hosting/deploy/)を参照してください。

## シークレットと変数

- **シークレット**は、本番では `wrangler secret put <NAME>`、ローカル開発では
  `apps/web/.dev.vars`(gitignored)で設定します。コミットしないでください。
- **非機密の ID やフラグ**は `apps/web/wrangler.jsonc` に置きます。

この分離はセキュリティ上の不変条件です。`wrangler.jsonc` には非機密 ID のみを置けます。
[セキュリティ](/ja/self-hosting/security/)を参照してください。

## 環境変数・シークレット

ローカル開発では `apps/web/.dev.vars.example` を出発点にしてください。

| 名前 | 必須 | 用途 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | **はい** | セッショントークンの署名。**32 文字以上**が必須で、未設定や短すぎる値では Worker がフェイルクローズします。`openssl rand -base64 32` で生成。 |
| `BETTER_AUTH_URL` | 推奨 | アプリの配信元ベース URL(例: `https://spantail.example.com`、開発では `http://localhost:5173`)。OAuth コールバックやリンクに使用。 |
| `GOOGLE_OAUTH_CLIENT_ID` | 任意 | Google をログインプロバイダとして利用可能にします。有効化は管理者がアプリ内で行います。 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 任意 | Google クライアント ID と対で使用。 |
| `GITHUB_OAUTH_CLIENT_ID` | 任意 | GitHub をログインプロバイダとして利用可能にします。 |
| `GITHUB_OAUTH_CLIENT_SECRET` | 任意 | GitHub クライアント ID と対で使用。 |
| `APP_ENV` | — | `development` / `production`(`wrangler.jsonc` で設定)。production 以外の値では、メーラーは実際のメールサービスではなくインメモリの開発用 outbox に送ります。 |

プロバイダの資格情報を空のままにすると、そのプロバイダは利用不可のままになります。中途半端に設定
されたログイン経路は存在しません。

## OAuth コールバック URL

プロバイダの資格情報を設定したら、そのコールバック URL をプロバイダに登録してください。

- Google — `${BETTER_AUTH_URL}/api/auth/callback/google`
- GitHub — `${BETTER_AUTH_URL}/api/auth/callback/github`

設定済みプロバイダの有効化はアプリ内の管理者操作です。[セットアップウィザード](/ja/self-hosting/setup-wizard/)
の途中、または後から管理者ガイドで行います。

## バインディング

`apps/web/wrangler.jsonc` で定義されています。プレースホルダー ID を、あなたの Cloudflare
アカウントで作成したリソースに置き換えてください。

| バインディング | 種別 | 役割 |
| --- | --- | --- |
| `DB` | D1 データベース | 主データベース。`wrangler d1 create spantail-db` で作成。 |
| `UPLOADS` | R2 バケット | ユーザーがアップロードしたメディア(アバター、ワークスペースロゴ)。`wrangler r2 bucket create spantail-uploads` で作成。 |
| `USER_HUB` | Durable Object | SSE 無効化シグナルのユーザー単位リアルタイム配信。SQLite ベースで Workers Free プランで動作。 |
| `EMAIL` | Email Service | 送信メール。Workers Paid プランで送信ドメインを登録するまでは無効(inert)。 |
| `INGEST_RATE_LIMITER` | レートリミッター | 信頼できない取り込み経路の資格情報単位の上限(120 リクエスト / 60 秒)。漏えいしたトークンが D1 を圧迫しないようにします。 |
