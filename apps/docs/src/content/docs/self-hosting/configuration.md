---
title: Configuration
description: Environment variables, secrets, and bindings.
---

This page is the reference for everything you configure on a Spantail instance. For the
step-by-step deploy flow, see [Deploy to Cloudflare](/self-hosting/deploy/).

## Secrets vs. variables

- **Secrets** are set with `wrangler secret put <NAME>` in production, or in
  `apps/web/.dev.vars` (gitignored) for local development. Never commit them.
- **Non-secret IDs and flags** live in `apps/web/wrangler.jsonc`.

This split is a security invariant: `wrangler.jsonc` may contain only non-secret IDs. See
[Security](/self-hosting/security/).

## Environment variables & secrets

Start from `apps/web/.dev.vars.example` for local development.

| Name | Required | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | **Yes** | Signs session tokens. Must be **≥ 32 characters** — a missing or too-short value makes the Worker fail closed. Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | Optional | The canonical origin for email links and OAuth callbacks. Leave it unset to derive the origin from each request (enough for `*.workers.dev` and local dev); set it to pin a canonical origin behind a custom domain or a proxy that rewrites the host. |
| `GOOGLE_OAUTH_CLIENT_ID` | Optional | Enables Google as an available login provider. An admin still turns it on in the app. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Optional | Paired with the Google client ID. |
| `GITHUB_OAUTH_CLIENT_ID` | Optional | Enables GitHub as an available login provider. |
| `GITHUB_OAUTH_CLIENT_SECRET` | Optional | Paired with the GitHub client ID. |
| `APP_ENV` | — | `development` / `production`, set in `wrangler.jsonc`. In any non-production value the mailer routes to an in-memory dev outbox instead of the real email service. |

Leaving a provider's credentials blank keeps it unavailable — there is no half-configured login
surface.

## OAuth callback URLs

When you set a provider's credentials, register its callback URL with the provider. Use your
instance's origin — the value of `BETTER_AUTH_URL` if you set one, otherwise the origin the app is
served from (its `*.workers.dev` URL or custom domain):

- Google — `<your-origin>/api/auth/callback/google`
- GitHub — `<your-origin>/api/auth/callback/github`

Enabling a configured provider is an in-app admin action — during the
[setup wizard](/self-hosting/setup-wizard/) or later from
[System settings](/admin/system-settings/) in the Admin guide.

## Bindings

Defined in `apps/web/wrangler.jsonc`. Replace the placeholder IDs with the resources you create
in your Cloudflare account.

| Binding | Type | Role |
| --- | --- | --- |
| `DB` | D1 database | Primary database. Create with `wrangler d1 create spantail-db`. |
| `UPLOADS` | R2 bucket | User-uploaded media (avatars, workspace logos). Create with `wrangler r2 bucket create spantail-uploads`. |
| `USER_HUB` | Durable Object | Per-user realtime fan-out for SSE invalidation signals. Idle until an admin enables realtime updates; each open stream accrues Durable Object duration against the Free plan's daily quota. |
| `EMAIL` | Email Service | Outbound email. Inert until your account onboards a sending domain on a Workers Paid plan. |
| `INGEST_RATE_LIMITER` | Rate limiter | Per-credential cap (120 requests / 60s) on the untrusted ingest path, so a leaked token cannot flood D1. |
