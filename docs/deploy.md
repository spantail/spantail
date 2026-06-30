# Deploying and upgrading

Operational runbook for **deploying and upgrading a self-hosted Spantail instance by hand**, from a
git checkout, using Wrangler. It is the engineer-facing companion to the user-facing
[self-hosting guide](https://docs.spantail.com/self-hosting/) (concepts, first-time setup, and the
configuration reference) and to [`releasing.md`](./releasing.md) (how the product is versioned).

This runbook does not restate the conceptual setup or the configuration reference — it links to
them and focuses on the exact commands, the **migration-bearing upgrade** flow, and
backup/rollback, which are documented nowhere else.

All examples are instance-agnostic. Replace `spantail-db`, database IDs, and origins with your own.

## Prerequisites

- Node, pnpm, and Wrangler per the [requirements](https://docs.spantail.com/self-hosting/).
- Wrangler authenticated against your Cloudflare account — either `wrangler login`, or
  `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the environment (the token needs Workers
  Scripts, D1, and R2 edit permissions).
- `apps/web/wrangler.jsonc` pointed at your own resources: set your D1 `database_id` in **both** the
  top-level `d1_databases` block and the `env.production.d1_databases` block (they ship with
  placeholder IDs), and confirm the R2 bucket name. Every binding, secret, and variable is listed in
  the [configuration reference](https://docs.spantail.com/self-hosting/configuration/).

`wrangler.jsonc` holds only non-secret IDs; secrets go through `wrangler secret put`.

## Initial deploy

For the first deploy of a fresh instance, follow the
[Deploy to Cloudflare](https://docs.spantail.com/self-hosting/deploy/) guide. In short:

```bash
wrangler d1 create spantail-db            # copy the id into wrangler.jsonc (both blocks)
wrangler r2 bucket create spantail-uploads
wrangler secret put BETTER_AUTH_SECRET    # >= 32 chars, e.g. openssl rand -base64 32
pnpm db:migrate:remote                    # apply all migrations to the new database
pnpm run deploy
```

Then set `BETTER_AUTH_URL` to your deployed origin and finish in the
[setup wizard](https://docs.spantail.com/self-hosting/setup-wizard/) — the first person to sign up
becomes the instance administrator.

> Use `pnpm run deploy`, not `pnpm deploy`: the latter collides with pnpm's built-in `deploy`
> command. If `wrangler` invoked from the repo root misbehaves, run it scoped to the app:
> `pnpm --filter web exec wrangler <args>`.

## Upgrading an existing instance

A new release may add database migrations. Spantail keeps migrations **additive and
backward-compatible** wherever possible (in `0.x` nothing is guaranteed, but breaking schema changes
are avoided), so the standard flow is **back up → migrate → deploy**.

1. **Check out the target version and install.**

   ```bash
   git fetch --tags
   git checkout vX.Y.Z          # or: git pull on main
   pnpm install
   ```

2. **See what changed**, especially new migrations.

   ```bash
   git log --oneline v<old>..v<new>
   ls packages/db/migrations    # new NNNN_*.sql files since your last deploy
   ```

   Applied migrations are tracked in D1's `d1_migrations` table, so `pnpm db:migrate:remote` runs
   only the ones the database has not seen yet — it is idempotent and safe to re-run.

3. **Back up the remote database first.** A migration mutates production data; take an export before
   applying it.

   ```bash
   pnpm --filter web exec wrangler d1 export spantail-db --remote \
     --output=backup-vX.Y.Z-YYYYMMDD.sql
   ```

   As a complementary safety net, D1 **Time Travel** can restore the database to any point in the
   last 30 days without a manual backup:

   ```bash
   wrangler d1 time-travel info spantail-db                          # current bookmark / timestamp
   wrangler d1 time-travel restore spantail-db --timestamp=<ISO-8601>
   ```

4. **Apply the new migrations.**

   ```bash
   pnpm db:migrate:remote
   ```

5. **Deploy the new Worker.**

   ```bash
   pnpm run deploy
   ```

   **Order matters: migrate before deploy.** The new code expects the new schema, and additive
   migrations (new columns or indexes) are invisible to the still-running old Worker, so the brief
   window between the two steps is safe. A genuinely breaking schema change would need a maintenance
   window and a different sequence; the release notes call that out when it happens.

6. **Verify.** Smoke-test the main screens and exercise whatever the release changed.

### Rollback

A schema migration does not roll back automatically. To revert:

1. Restore the database from your export or via Time Travel (above).
2. Redeploy the previous version:

   ```bash
   git checkout v<old>
   pnpm install
   pnpm run deploy
   ```

`wrangler deployments list` / `wrangler rollback` can also revert the Worker, but that reverts only
code — not schema, which is why the database restore comes first.

## Example: v0.1.0 → v0.2.0

`v0.2.0` adds three additive migrations to `report_templates`: new `is_default`, `name_template`,
`note_template`, and `default_date_range` columns, plus a partial unique index on the default. No
special handling is needed — follow [Upgrading an existing instance](#upgrading-an-existing-instance)
as-is: `pnpm db:migrate:remote` applies the three unseen migrations and `pnpm run deploy` ships the
code.
