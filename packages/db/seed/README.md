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

The generation logic lives in this directory (`generate.ts`, `schema.ts`,
`seed.ts`); the data lives separately under
[`examples/db/seed/<name>/`](../../../examples/db/seed). `pnpm db:seed <name>`
selects which dataset's YAML supplies the data, so you can drop in your own
dataset by adding a sibling directory.

## Datasets

| Name | Language | Users |
| --- | --- | --- |
| `demo` (default) | English | `*@northwind.example`, `frank@initech.example` |
| `demo-ja` | Japanese | `*@azumino.example`, `daisuke@kanda.example` |

The two datasets use **distinct users** (different names and emails), so they
never share a login identity.

Each dataset is sized so that at least one instance of every busy screen
overflows a page (the SPA paginates at 50 rows): **Home**, **Project detail**,
**Reports**, **Messages** (inbox), and **Agent detail**. Signing in as the
instance admin (Alice / 花子) is the quickest way to see them all.

## Sign-in

Every seeded user shares the password **`Spantail-Demo-7Qx2k!`** (long and
mixed-class so browsers and password managers don't flag it on sign-in).

**`demo`:**

| Email | Role |
| --- | --- |
| `alice@northwind.example` | instance admin |
| `bilal@northwind.example` | template author |
| `carol@northwind.example` | member |
| `daichi@northwind.example` | member |
| `erin@northwind.example` | member |
| `frank@initech.example` | member |

**`demo-ja`:**

| Email | Role |
| --- | --- |
| `hanako@azumino.example` | instance admin |
| `ichiro@azumino.example` | template author |
| `misaki@azumino.example` | member |
| `ken@azumino.example` | member |
| `yumi@azumino.example` | member |
| `daisuke@kanda.example` | member |

## The demo world

Both datasets share the same shape (the Japanese one mirrors the English one):

- An **internal consultancy** (the instance owner) staffing engineers onto three
  client workspaces, plus a separate client workspace that **no team member
  belongs to** — run solo by one person. The instance admin can still reach that
  workspace via the instance-admin bypass (visible in the switcher and Settings),
  but its workspace-scoped sidebar stays blank for them.
- Six people. Everyone is a member of the internal workspace; each is staffed
  onto one or more clients with a clear shape — a **main engagement**, some
  **internal** work, and the **occasional cross-client help**. The admin keeps a
  daily internal line *and* a daily client line, so their Home and Reports both
  fill more than a page; the internal owner also receives every teammate's daily
  internal report, so their inbox does too.
- Members log Mon–Fri for the last 45 days, but the days have texture: hours rise
  and fall around a typical ~8h, lines are worked at different cadences (daily /
  most days / weekly / a few days a month), the occasional weekday is taken off,
  and each entry uses a concrete, project-specific task phrase. All of it is
  derived deterministically from the user + date, so reruns are reproducible.
- Reports use the default template matching the workspace language (English in
  `demo`, Japanese in `demo-ja`).
- **Daily reports.** Each weekday a member files a per-workspace daily report
  sent to that workspace's manager. The two engineers split across both coastal
  clients instead file a single **cross-workspace daily report**. A cross-workspace
  report mixes those workspaces' entries, so it is delivered only to people who
  are members of *every* listed workspace — the same rule the app's "Send to"
  picker enforces — and so never exposes a workspace the recipient doesn't belong
  to.
- **Monthly reports.** At month end each member files a per-workspace monthly
  report sent to the manager — and, for client workspaces, published as a share
  link. Monthly reports stay per-workspace (a formal per-client deliverable), so
  a client share never carries another client's data.

## Editing the data

Declarative data lives under `examples/db/seed/<name>/` as YAML (users,
workspaces, members, projects with their task `activities`, work patterns,
cross-workspace report routes, instance settings); it is validated against
[`schema.ts`](./schema.ts) on load. Activity (work entries, reports, deliveries,
shares) is derived at run time by [`generate.ts`](./generate.ts), relative to the
current date. Report template bodies come from `@spantail/templates` (one default
per locale), not from the dataset.

A cross-workspace route in `report-routes.yaml` names only the sender and the
workspaces the report spans; its recipients are *derived* from membership
(everyone in all listed workspaces, minus the sender), so the data can never
declare a delivery the app's permission rule would reject. Loading fails if a
route's sender isn't a member of every listed workspace, or if no eligible
recipient exists.
