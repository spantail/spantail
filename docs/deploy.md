# Deploying and upgrading

Operational runbook for **deploying and upgrading a self-hosted Spantail instance by hand**, from a
git checkout, using Wrangler. It is the engineer-facing companion to the user-facing
[self-hosting guide](https://docs.spantail.com/self-hosting/) (concepts, first-time setup, and the
configuration reference) and to [`releasing.md`](./releasing.md) (how the product is versioned).

The recommended deploy path is a fork connected to **Cloudflare Workers Builds**, where an upgrade is
GitHub's Sync fork button — see the [self-hosting guide](https://docs.spantail.com/self-hosting/deploy/).
This runbook covers the **by-hand Wrangler flow** instead, plus the **migration-bearing upgrade** flow
and backup/rollback, which apply to either path and are documented nowhere else. It does not restate
the conceptual setup or the configuration reference — it links to them.

All examples are instance-agnostic. Replace `spantail-db`, database IDs, and origins with your own.

## Prerequisites

- Node, pnpm, and Wrangler per the [requirements](https://docs.spantail.com/self-hosting/).
- Wrangler authenticated against your Cloudflare account — either `wrangler login`, or
  `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the environment (the token needs Workers
  Scripts, D1, and R2 edit permissions).

## Set up a deploy repository

Deploy from your own copy of the repository with your instance's configuration committed to it, and
track the public repo as `upstream` so you can pull new releases:

```bash
git clone <your-repo-url> spantail && cd spantail
git remote add upstream https://github.com/spantail/spantail.git
```

The only committed change to the source tree is the configuration below — non-secret IDs, so it is
safe to commit. If that configuration must stay private, use a **private** repository: a GitHub fork
of a public repo is itself public. Pull later releases by merging from `upstream` (see
[Upgrading](#upgrading-an-existing-instance)).

## Initial deploy

For a fresh instance, create the Cloudflare resources, point the config at them, then migrate and
deploy. The [Deploy to Cloudflare](https://docs.spantail.com/self-hosting/deploy/) guide is the
narrative version of these steps.

1. **Create the D1 database and the R2 bucket.**

   ```bash
   wrangler d1 create spantail-db
   wrangler r2 bucket create spantail-uploads
   ```

2. **Point `apps/web/wrangler.jsonc` at them.** It ships with placeholder IDs and holds only
   **non-secret IDs** (secrets go through `wrangler secret put`); the
   [configuration reference](https://docs.spantail.com/self-hosting/configuration/) documents every
   field. Edit, at minimum:

   - **`d1_databases[].database_id`** — the ID returned by `wrangler d1 create` above. There is a
     single top-level `d1_databases` block (no named environments).
   - **`r2_buckets[].bucket_name`** — match the bucket you created.

   You do not need to set `APP_ENV`: `pnpm run deploy` passes `--var APP_ENV:production`, so a
   by-hand deploy always runs in production mode. The committed default stays `development` (mail
   routes to an in-memory dev outbox locally).

3. **Set the session secret.**

   ```bash
   wrangler secret put BETTER_AUTH_SECRET    # >= 32 chars, e.g. openssl rand -base64 32
   ```

4. **Apply migrations, then deploy.**

   ```bash
   pnpm db:migrate:remote                    # apply all migrations to the new database
   pnpm run deploy
   ```

Finally, set `BETTER_AUTH_URL` to your deployed origin and finish in the
[setup wizard](https://docs.spantail.com/self-hosting/setup-wizard/) — the first person to sign up
becomes the instance administrator.

> Use `pnpm run deploy`, not `pnpm deploy`: the latter collides with pnpm's built-in `deploy`
> command. If `wrangler` invoked from the repo root misbehaves, run it scoped to the app:
> `pnpm --filter web exec wrangler <args>`.

## Upgrading an existing instance

A new release may add database migrations. Spantail keeps migrations **additive and
backward-compatible** wherever possible (in `0.x` nothing is guaranteed, but breaking schema changes
are avoided), so the standard flow is **back up → migrate → deploy**.

1. **Pull the target release and install.** With the public repo tracked as `upstream`:

   ```bash
   git fetch upstream --tags
   git merge vX.Y.Z             # a release tag; or `git merge upstream/main` for the latest
   pnpm install
   ```

   Resolve any conflict in `apps/web/wrangler.jsonc` by keeping your IDs and taking upstream's
   structural changes. (Deploying from a plain clone of the public repo instead of your own copy?
   Use `git fetch --tags && git checkout vX.Y.Z`.)

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
