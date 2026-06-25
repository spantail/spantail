# Seed data & local reset

Tooling to populate (and reset) the **local** D1 used by `pnpm dev` with a
coherent demo world, for manual testing and demos.

```bash
pnpm db:seed     # insert demo data into the local DB
pnpm db:drop     # wipe local D1 state (schema and data)
pnpm db:reset    # db:drop → db:migrate:local → db:seed
```

`db:reset` is the usual entry point: it drops local state, recreates the schema
from migrations, then seeds. All commands are **local-only** (they never touch a
remote database).

## Sign-in

Every seeded user shares the password **`password`**:

| Email | Role |
| --- | --- |
| `alice@northwind.example` | instance admin |
| `bilal@northwind.example` | template author |
| `carol@northwind.example` | member |
| `daichi@northwind.example` | member |
| `erin@northwind.example` | member |
| `frank@initech.example` | member |

## The demo world

- **Northwind Software** — a fictional software consultancy (the instance owner,
  internal workspace, English) staffing engineers onto three client workspaces:
  **Acme Robotics** and **Globex Media** (English, America/Los_Angeles) and
  **桜トレーディング** (Japanese, Asia/Tokyo). English-first: only the Japanese
  client's work logs and reports are in Japanese.
- Five people. Everyone is a member of the internal workspace; each is staffed
  onto one or more clients with a clear shape — a **main engagement** that fills
  most of the day, a little **internal** work, and the **occasional cross-client
  help**:
  - **Alice** (owner) — runs Northwind internally; occasional 桜 liaison work.
  - **Bilal** & **Erin** — both shared across the two English clients (Acme +
    Globex).
  - **Carol** (Globex lead) — mostly Globex, helps Acme now and then.
  - **Daichi** (桜 lead) — mostly the Japanese client; his 桜 work logs are in
    Japanese (his lighter internal work, like everyone's, is in English).
- **Initech** — a separate English workspace that **no Northwind member belongs
  to**, run solo by **Frank** (`frank@initech.example`). Because Alice is the
  instance admin but not a member here, Initech surfaces for her only through the
  instance-admin bypass: she can see it in the workspace switcher and reach its
  Settings, but the workspace-scoped sidebar stays blank (she is not a member).
- Members log Mon–Fri for the last 45 days, but the days have texture: hours rise
  and fall around a typical ~8h, lines are worked at different cadences (daily /
  most days / weekly / a few days a month), the occasional weekday is taken off,
  and each entry uses a concrete, project-specific task phrase. All of it is
  derived deterministically from the user + date, so reruns are reproducible.
- Four custom report templates (daily + monthly, English + Japanese); the
  builtin templates are disabled. Reports use the template matching the
  workspace language.
- **Daily reports.** Each weekday a member files a per-workspace daily report
  (one per workspace they worked in) sent to that workspace's manager. Bilal and
  Erin, who split their week across both English clients, instead file a single
  **cross-workspace daily report** spanning Acme + Globex. A cross-workspace
  report mixes those workspaces' entries, so it is delivered only to people who
  are members of *every* listed workspace — the same rule the app's "Send to"
  picker enforces — and so never exposes a workspace the recipient doesn't belong
  to (Bilal's reaches Carol + Erin; Erin's reaches Bilal + Carol).
- **Monthly reports.** At month end each member files a per-workspace monthly
  report sent to the manager — and, for client workspaces, published as a share
  link. Monthly reports stay per-workspace (a formal per-client deliverable), so
  a client share never carries another client's data.

## Editing the data

Declarative data lives in [`data/`](./data) as YAML (users, workspaces, members,
projects with their task `activities`, templates, work patterns, cross-workspace
report routes, instance settings); it is validated against [`schema.ts`](./schema.ts)
on load. Activity (work entries, reports, deliveries, shares) is derived at run
time by [`generate.ts`](./generate.ts), relative to the current date. English
template bodies reuse the code-defined builtins; the Japanese variants are
authored in `data/templates.yaml`.

A cross-workspace route in `data/report-routes.yaml` names only the sender and
the workspaces the report spans; its recipients are *derived* from membership
(everyone in all listed workspaces, minus the sender), so the data can never
declare a delivery the app's permission rule would reject. Loading fails if a
route's sender isn't a member of every listed workspace, or if no eligible
recipient exists.
