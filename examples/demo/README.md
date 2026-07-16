# `demo` dataset (English)

A coherent, English-language demo world for local development and demos. Load it
with `pnpm db:seed demo` (it is also the default: `pnpm db:seed`). See
[`packages/db/seed/README.md`](../../packages/db/seed/README.md) for the seeding
commands and how datasets are loaded.

The seed YAML lives in [`db/seed/`](./db/seed). It is **declarative data only**;
the activity (work entries, reports, deliveries, shares, agent telemetry) is
derived at run time by the generator in `packages/db/seed`, relative to the
current date, so reruns are reproducible.

## Sign-in

Each user has its own password, printed by `pnpm db:seed` when it finishes.

| Email | Role |
| --- | --- |
| `alice@northwind.example` | instance admin |
| `bilal@northwind.example` | template author |
| `carol@northwind.example` | member |
| `daichi@northwind.example` | member |
| `erin@northwind.example` | member |
| `frank@initech.example` | member |

## The world

**Northwind Software** is a fictional software consultancy (the instance owner,
internal workspace) staffing engineers onto client workspaces:

- **Northwind Software** — internal, `Asia/Tokyo`. Owner: **Alice**; all five
  team members belong.
- **Acme Robotics** — client, `America/Los_Angeles`. Lead: **Bilal**; staffed:
  Bilal, Erin, Carol.
- **Globex Media** — client, `America/Los_Angeles`. Lead: **Carol**; staffed:
  Carol, Bilal, Erin.
- **Meridian Logistics** — client, `Asia/Tokyo`. Lead: **Daichi**; staffed:
  Daichi, Alice (daily liaison).
- **Initech** — client, `America/New_York`, run solo by **Frank**. No Northwind
  member belongs here, so it surfaces for Alice only through the instance-admin
  bypass: she can see it in the workspace switcher and reach its Settings, but
  the workspace-scoped sidebar stays blank (she is not a member).

The internal owner's role anchors the shape: Alice keeps a daily internal line
**and** a daily client line, and the two engineers shared across the coastal
clients file a combined cross-workspace daily report (see below).

## Work patterns

`work-patterns.yaml` allocates each member's typical day. Each line is a project,
the typical minutes spent on it on a day it is worked, and how often it is worked
(`cadence`):

- `daily` — every working day (the member's main engagement)
- `often` — most days (a regular secondary engagement)
- `weekly` — about once a week (light internal work)
- `occasional` — a few days a month (cross-client help)

The generator jitters the minutes per day and takes the occasional day off, so
totals land around ~8h but rise and fall. `tags` lists the per-locale tag pool
entries are drawn from.

## Reports

- **Daily reports.** Each weekday a member files a per-workspace daily report
  sent to that workspace's manager. Bilal and Erin, shared across Acme + Globex,
  instead file a single **cross-workspace daily report** spanning both. A
  cross-workspace report mixes those workspaces' entries, so it is delivered only
  to people who are members of *every* listed workspace (the same rule the app's
  "Send to" picker enforces) — Bilal's reaches Carol + Erin; Erin's reaches Bilal
  + Carol.
- **Monthly reports.** At month end each member files a per-workspace monthly
  report sent to the manager — and, for client workspaces, published as a share
  link. Monthly reports stay per-workspace, so a client share never carries
  another client's data.
- One default report template is seeded, in this dataset's locale (English).

`report-routes.yaml` declares only the sender and the workspaces a combined
report spans (first is the anchor for timezone/language); recipients are derived
from membership, never widened. Loading fails if a route's sender isn't a member
of every listed workspace, or if no eligible recipient exists.

## Designed for pagination

The dataset is sized so at least one instance of every busy screen overflows a
page (the SPA paginates at 50 rows). Signing in as **Alice** is the quickest way
to see them all:

| Screen | Driving data | Why it overflows |
| --- | --- | --- |
| Home | Alice's work entries in Northwind | two daily internal lines |
| Project detail | a shared project (e.g. Globex's Web Portal) | two daily contributors |
| Reports | Alice's own reports | daily entries in two workspaces |
| Messages | Alice's inbox | every teammate's daily internal report |
| Agent detail | Alice's agent | 3 sessions/weekday over the window |

## Bulk-import verification data

`pnpm generate-import demo` writes `import/work-entries.jsonl` (gitignored):
three years of weekday entries for the first workspace (Northwind), in the
format `spantail entries import` consumes. Use it to exercise the batch-import
path end to end:

```sh
pnpm generate-import demo
spantail entries import examples/demo/import/work-entries.jsonl --workspace northwind
```

The generated lines carry no `externalId`, so re-importing the file duplicates
entries — that is the documented plain-insert behavior. Add `externalId` fields
to a hand-made file to see idempotent re-imports instead.

## Scenarios

[`scenarios/product-tour.js`](./scenarios/product-tour.js) is a Playwright
function that walks this dataset end to end as Alice — entries, agent sessions,
log-work-from-sessions, a daily report, share, send, and inbox review — paced
for recording product demos. Its header documents the prerequisites and the
date-relative literals to adjust before a run.

## Files

`db/seed/` holds one YAML per concern: `users`, `workspaces`, `members`,
`projects` (with task `activities`), `work-patterns`, `report-routes`, and
`instance` (feature toggles — all enabled in this dataset). Each is validated
against `packages/db/seed/schema.ts` on load.
