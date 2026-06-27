# `demo-ja` dataset (Japanese)

The Japanese counterpart of [`demo`](../demo/README.md): the same structure, but
every workspace is Japanese (`Asia/Tokyo`) and the cast is a **distinct set of
users** (different names and emails), so the two datasets never share a login
identity. Load it with `pnpm db:seed demo-ja`. See
[`packages/db/seed/README.md`](../../packages/db/seed/README.md) for the seeding
commands and how datasets are loaded.

The seed YAML lives in [`db/seed/`](./db/seed). It is **declarative data only**;
activity is derived at run time by the generator, relative to the current date.

## Sign-in

Every user shares the password documented in
[`packages/db/seed/README.md`](../../packages/db/seed/README.md).

| Email | Name | Role |
| --- | --- | --- |
| `hanako@azumino.example` | 山田 花子 | instance admin |
| `ichiro@azumino.example` | 鈴木 一郎 | template author |
| `misaki@azumino.example` | 田中 美咲 | member |
| `ken@azumino.example` | 佐藤 健 | member |
| `yumi@azumino.example` | 高橋 由美 | member |
| `daisuke@kanda.example` | 渡辺 大輔 | member |

## The world

**あづみ野ソフトウェア** (Azumino Software) is a fictional consultancy (the
instance owner, internal workspace) staffing engineers onto client workspaces:

- **あづみ野ソフトウェア** — internal. Owner: **Hanako**; all five team members
  belong.
- **桜トレーディング** (Sakura Trading) — client. Lead: **Ichiro**; staffed:
  Ichiro, Yumi, Misaki.
- **富士メディア** (Fuji Media) — client. Lead: **Misaki**; staffed: Misaki,
  Ichiro, Yumi.
- **椿物流** (Tsubaki Logistics) — client. Lead: **Ken**; staffed: Ken, Hanako
  (daily liaison).
- **神田システムズ** (Kanda Systems) — client, run solo by **Daisuke**. No
  Azumino member belongs here, so it surfaces for Hanako only through the
  instance-admin bypass.

All workspaces are `Asia/Tokyo`. The shape mirrors `demo`: Hanako keeps a daily
internal line and a daily client line, and the two engineers shared across Sakura
+ Fuji file a combined cross-workspace daily report.

## Work patterns, reports, pagination

These behave exactly as in [`demo`](../demo/README.md) — see that README for the
cadence definitions, the daily/monthly/cross-workspace report rules, and the
per-screen pagination breakdown. The only differences here are the localized
content and the distinct users. One default report template is seeded, in this
dataset's locale (Japanese).

`report-routes.yaml` declares only the sender and the workspaces a combined
report spans (first is the anchor); recipients are derived from membership.

## Files

`db/seed/` holds one YAML per concern: `users`, `workspaces`, `members`,
`projects` (with task `activities`), `work-patterns`, `report-routes`, and
`instance` (feature toggles — all enabled). Each is validated against
`packages/db/seed/schema.ts` on load.
