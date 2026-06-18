# Seed data & local reset

Tooling to populate (and reset) the **local** D1/R2 used by `pnpm dev` with a
coherent demo world, for manual testing and demos.

```bash
pnpm db:seed     # insert demo data into the local DB + R2
pnpm db:drop     # wipe local D1 + R2 state (schema and data)
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

## The demo world

- **Northwind Software** (the instance owner, a fictional software firm) plus
  three client workspaces: **Acme Robotics** and **Globex Media** (English,
  America/Los_Angeles) and **桜トレーディング** (Japanese, Asia/Tokyo).
- Each workspace has 3 members (one manager) and 3 projects; members span
  multiple workspaces.
- Members log Mon–Fri, 8h/day, for the last 45 days.
- Four custom report templates (daily + monthly, English + Japanese); the
  builtin templates are disabled. Reports use the template matching the
  workspace language.
- Members file a cross-workspace daily report each weekday (sent to the relevant
  workspace managers) and a per-workspace monthly report at month end (sent to
  the manager, and — for client workspaces — published as a share link).

## Editing the data

Declarative data lives in [`data/`](./data) as YAML (users, workspaces, members,
projects, templates, work patterns, instance settings); it is validated against
[`schema.ts`](./schema.ts) on load. Activity (work entries, reports, deliveries,
shares) is derived at run time by [`generate.ts`](./generate.ts), relative to the
current date. English template bodies reuse the code-defined builtins; the
Japanese variants are authored in `data/templates.yaml`.
