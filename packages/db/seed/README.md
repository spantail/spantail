# Seed data & local reset

Tooling to populate (and reset) the **local** D1 used by `pnpm dev` with a
coherent demo world, for manual testing and demos.

```bash
pnpm db:reset          # db:drop → db:migrate:local (schema only, no data)
pnpm db:seed           # insert the default dataset (demo) into the local DB
pnpm db:seed demo      # insert the English demo dataset
pnpm db:seed demo-ja   # insert the Japanese demo dataset
pnpm db:drop           # wipe local D1 state (schema and data)
```

`db:reset` drops local state and recreates the schema from migrations; it does
**not** seed, so you get an empty database. Run `pnpm db:seed <name>` afterwards
to load a dataset. All commands are **local-only** (they never touch a remote
database).

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

A dataset whose name ends with `-ja` is treated as Japanese (its single default
report template is seeded in Japanese); all others are English. The two shipped
datasets use **distinct users**, so they never share a login identity. Each is
sized so at least one instance of every busy screen overflows a page (the SPA
paginates at 50 rows): **Home**, **Project detail**, **Reports**, **Messages**,
and **Agent detail** — see each dataset's README for the per-screen breakdown.

## Sign-in

Every seeded user shares the password **`Spantail-Demo-7Qx2k!`** (long and
mixed-class so browsers and password managers don't flag it on sign-in). Each
dataset's users are listed in its own README (linked above).

## How a dataset is generated

Each dataset is **declarative YAML** (users, workspaces, members, projects with
their task `activities`, work patterns, cross-workspace report routes, instance
settings), validated against [`schema.ts`](./schema.ts) on load. The activity
(work entries, reports, deliveries, shares, agent telemetry) is derived at run
time by [`generate.ts`](./generate.ts), relative to the current date, so reruns
are reproducible. One default report template is seeded from `@spantail/templates`
in the dataset's locale.

A cross-workspace route in `report-routes.yaml` names only the sender and the
workspaces the report spans; its recipients are *derived* from membership
(everyone in all listed workspaces, minus the sender), so the data can never
declare a delivery the app's permission rule would reject. Loading fails if a
route's sender isn't a member of every listed workspace, or if no eligible
recipient exists.
