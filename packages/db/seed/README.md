# Seed data & local reset

Tooling to populate (and reset) the **local** D1 used by `pnpm dev` with a
coherent demo world, for manual testing and demos.

```bash
pnpm db:reset          # db:drop → db:migrate:local (schema only, no data)
pnpm db:seed           # insert the default dataset (demo) into the local DB
pnpm db:seed demo      # insert the English demo dataset
pnpm db:seed demo-ja   # insert the Japanese demo dataset
pnpm db:drop           # wipe local D1 state (schema and data)
pnpm db:seed:sql demo  # print the dataset's seed SQL (for a remote DB; see below)
```

`db:reset` drops local state and recreates the schema from migrations; it does
**not** seed, so you get an empty database. Run `pnpm db:seed <name>` afterwards
to load a dataset. `db:seed` is **local-only** (it never touches a remote
database); `db:seed:sql` writes SQL and touches nothing at all.

`pnpm db:seed` also uploads the dataset's R2 assets (avatars, logos) into the
local Miniflare bucket so they render in `pnpm dev` — see [R2 assets](#r2-assets).

## Datasets

The generation logic lives in this directory (`generate.ts`, `schema.ts`,
`seed.ts`). The data lives separately, one directory per dataset under
[`examples/<name>/db/seed/`](../../../examples). `pnpm db:seed <name>` selects
which dataset's YAML supplies the data, so you can add your own by creating a new
`examples/<name>/db/seed/` directory.

| Name | Language | Cast |
| --- | --- | --- |
| `demo` (default) | English | [`examples/demo`](../../../examples/demo/README.md) |
| `demo-ja` | Japanese | [`examples/demo-ja`](../../../examples/demo-ja/README.md) |

A dataset whose name ends with `-ja` is treated as Japanese (its starter report
templates are seeded in Japanese); all others are English. The two shipped
datasets use **distinct users**, so they never share a login identity. Each is
sized so at least one instance of every busy screen overflows a page (the SPA
paginates at 50 rows): **Home**, **Project detail**, **Reports**, **Messages**,
and **Agent detail** — see each dataset's README for the per-screen breakdown.

## Sign-in

Each seeded user gets its **own** password (so a password manager won't flag
them as reused). `pnpm db:seed` prints the email + password pairs when it
finishes; the passwords are deterministic, so a rerun yields the same pairs. Each
dataset's users are listed in its own README (linked above).

## How a dataset is generated

Each dataset is **declarative YAML** (users, workspaces, members, projects with
their task `activities`, work patterns, cross-workspace report routes, instance
settings), validated against [`schema.ts`](./schema.ts) on load. The activity
(work entries, reports, deliveries, shares, agent telemetry) is derived at run
time by [`generate.ts`](./generate.ts), relative to the current date, so reruns
are reproducible. The starter report templates (Daily, Weekly, Monthly) are seeded
from `@spantail/templates` in the dataset's locale, with Daily as the instance default.

A cross-workspace route in `report-routes.yaml` names only the sender and the
workspaces the report spans; its recipients are *derived* from membership
(everyone in all listed workspaces, minus the sender), so the data can never
declare a delivery the app's permission rule would reject. Loading fails if a
route's sender isn't a member of every listed workspace, or if no eligible
recipient exists.

Seeded user and workspace ids are **deterministic** (a v5 UUID derived from the
dataset name + key, see [`ids.ts`](./ids.ts)), so a rerun — or `db:seed` vs
`db:seed:sql` — produces the same ids. That is what lets the R2 assets below be
committed as files whose names match the ids. Other rows (accounts, projects,
reports) keep random ids, as before.

## R2 assets

Each dataset can carry avatars and workspace logos under
[`examples/<name>/r2/`](../../../examples), laid out to mirror the R2 bucket's
key structure 1:1 (`avatars/<userId>`, `workspaces/<workspaceId>/logo`, extension
less, all WebP). A file's **presence** is the single source of truth: `generate.ts`
sets a user's `image` / a workspace's `logoUrl` only when the matching file
exists, so nothing in the YAML declares them.

```bash
pnpm generate-avatars demo     # (re)generate examples/demo/r2/ from the cast
pnpm generate-avatars demo-ja
```

The shipped assets are placeholder artwork ([`generate-avatars.ts`](./generate-avatars.ts)):
a stylized silhouette per user and a monogram per workspace, license-free and
visually distinct from the app's initials fallback. **Swap the files for real
photos without any code change** — only their presence and object key matter.

`pnpm db:seed` uploads them to the local bucket automatically. To seed a
**remote** instance, apply the SQL and sync the assets:

```bash
pnpm db:seed:sql demo --out seed.sql
wrangler d1 execute <DB> --remote --file seed.sql
# The files are extensionless, so a plain sync can't infer the type — set it:
aws s3 sync examples/demo/r2 s3://<bucket> --content-type image/webp
```
