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
| `BETTER_AUTH_URL` | 任意 | メール内リンクと OAuth コールバックの正規オリジン。未設定ならリクエストごとにオリジンを導出します(`*.workers.dev` やローカル開発はこれで十分)。カスタムドメインや、ホストを書き換えるプロキシの背後で正規オリジンを固定したい場合に設定します。 |
| `GOOGLE_OAUTH_CLIENT_ID` | 任意 | Google をログインプロバイダとして利用可能にします。有効化は管理者がアプリ内で行います。 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 任意 | Google クライアント ID と対で使用。 |
| `GITHUB_OAUTH_CLIENT_ID` | 任意 | GitHub をログインプロバイダとして利用可能にします。 |
| `GITHUB_OAUTH_CLIENT_SECRET` | 任意 | GitHub クライアント ID と対で使用。 |
| `APP_ENV` | — | `development` / `production`(`wrangler.jsonc` で設定)。production 以外の値では、メーラーは実際のメールサービスではなくインメモリの開発用 outbox に送ります。 |

プロバイダの資格情報を空のままにすると、そのプロバイダは利用不可のままになります。中途半端に設定
されたログイン経路は存在しません。

## ソーシャルログイン

Google・GitHub でのサインインは、それぞれ 3 ステップで設定します。プロバイダに OAuth アプリを
登録し、クライアント ID とクライアントシークレットを Worker に設定し、アプリ内でプロバイダを
有効化します。どちらか一方だけでも、両方でも構いません。

**1. プロバイダに OAuth アプリを登録する。** コールバック URL にはインスタンスのオリジン —
`BETTER_AUTH_URL` を設定していればその値、未設定なら配信元のオリジン(`*.workers.dev` の URL
またはカスタムドメイン) — を使います。

- **Google** — Google Cloud コンソールで、種類 **ウェブ アプリケーション** の
  **OAuth 2.0 クライアント ID** を作成し、**承認済みのリダイレクト URI** に
  `<your-origin>/api/auth/callback/google` を登録します。公式ガイド:
  [OAuth 2.0 の設定](https://support.google.com/cloud/answer/6158849?hl=ja)。
- **GitHub** — **Settings → Developer settings → OAuth Apps** で **New OAuth App** を作成し、
  **Authorization callback URL** に `<your-origin>/api/auth/callback/github` を登録します。
  公式ガイド:
  [OAuth アプリの作成](https://docs.github.com/ja/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)。

作成すると、どちらのプロバイダも**クライアント ID** と**クライアントシークレット**を発行します。

**2. 資格情報を Worker に設定する。** Worker のシークレットとして保存します（各 `put` で値の
入力を求められます）。

```bash
wrangler secret put GOOGLE_OAUTH_CLIENT_ID --name spantail
wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --name spantail
wrangler secret put GITHUB_OAUTH_CLIENT_ID --name spantail
wrangler secret put GITHUB_OAUTH_CLIENT_SECRET --name spantail
```

ローカル開発では、同じ名前を `apps/web/.dev.vars` に設定します。

**3. アプリ内でプロバイダを有効化する。** これはアプリ内の管理者操作です。
[セットアップウィザード](/ja/self-hosting/setup-wizard/)の途中、または後から管理者ガイドの
[システム設定](/ja/admin/system-settings/#ソーシャルログイン)で行います。プロバイダのトグルは、
資格情報が設定されて初めて有効化できるようになります。

## バインディング

`apps/web/wrangler.jsonc` で定義されています。プレースホルダー ID を、あなたの Cloudflare
アカウントで作成したリソースに置き換えてください。

| バインディング | 種別 | 役割 |
| --- | --- | --- |
| `DB` | D1 データベース | 主データベース。`wrangler d1 create spantail-db` で作成。 |
| `UPLOADS` | R2 バケット | ユーザーがアップロードしたメディア(アバター、ワークスペースロゴ)。`wrangler r2 bucket create spantail-uploads` で作成。 |
| `USER_HUB` | Durable Object | SSE 無効化シグナルのユーザー単位リアルタイム配信。管理者がリアルタイム更新を有効化するまではアイドル。開いているストリームは Durable Object の実行時間を消費し、Free プランでは 1 日のクォータに収まる必要があります。 |
| `EMAIL` | Email Service | 送信メール。Workers Paid プランで送信ドメインを登録するまでは無効(inert)。 |
| `INGEST_RATE_LIMITER` | レートリミッター | 信頼できない取り込み経路の資格情報単位の上限(120 リクエスト / 60 秒)。漏えいしたトークンが D1 を圧迫しないようにします。 |
