---
name: run-demo
description: Launch Spantail locally with demo data and drive it in a browser from a natural-language request (English or Japanese) — run a scenario, take screenshots, or record a walkthrough. Also the launch/seed/D1 recipe for manual checks and end-to-end verification.
---

# Run Spantail with demo data (Workers + D1 + React SPA)

Invoking this skill enters **demo mode for the rest of the conversation**:
after handling the initial request, treat every subsequent user message as
the next demo request too — the user does not re-invoke the skill between
tasks, and the dev server and browser stay up between them. Leave demo mode
when the user asks to finish (`exit`, `終了`, or an equivalent): kill the dev
server process, close the automation browser, restore any state you changed
for a request (e.g. feature flags), and report what ran.

The arguments are a natural-language request, in English or Japanese, of one
of three kinds. Do the simplest thing that fulfills it — success is
best-effort and model-dependent; do not add defensive scaffolding.

1. **Run a scenario** (e.g. "Run the instance-admin onboarding"): set up the
   right starting state, then click through the flow in the browser,
   narrating what happened.
2. **Take a screenshot** (e.g. "Screenshot the login screen with
   Google/GitHub sign-in enabled"): arrange the state the request names,
   capture the screen, and send the image file to the user.
3. **Record a walkthrough** (e.g. "Record creating a work entry from multiple
   agent sessions"): perform the flow while recording and send the result.
   Use the Claude-in-Chrome `gif_creator` when available; otherwise fall back
   to a screenshot at each step.

## Launch recipe (worktree-safe)

```bash
pnpm install                 # once per fresh worktree
pnpm db:migrate:local        # local D1 lives per-worktree (.wrangler state)
pnpm db:seed                 # demo dataset; PRINTS login credentials, e.g.
                             #   alice@northwind.example  Spantail-Alice-xxxxxx
pnpm dev                     # Vite + Worker on http://localhost:5173
```

- The demo dataset covers every major surface: users across several
  workspaces, projects, a month of work entries, reports with deliveries and
  shares, and (agents feature enabled) AI-agent sessions with per-turn events.
- Sign in at `/login` with a seeded email + the password printed by the seed.
- `pnpm db:seed demo-ja` seeds the Japanese dataset instead.

## Choosing the starting state

- **Fresh-instance scenarios** (onboarding, first-run setup): these need an
  empty instance, so **skip the `pnpm db:seed` step** of the launch recipe
  and run `pnpm db:reset` instead; the first sign-up becomes the instance
  admin.
- **Everything else**: use the seeded demo data. The first seeded user
  (Alice) is the instance admin; other users are plain members.
- **Instance feature flags** (email, social login, agents, realtime) live in
  the `instance_settings` singleton row: flip them at `/settings/features` as
  the instance admin, or directly in D1 (see below). Social-login buttons
  render only when the flag is on AND the provider's client id/secret are set
  in `apps/web/.dev.vars` (blank in `.dev.vars.example`) — dummy values are
  enough to show the buttons, though not to complete a sign-in.
- **UI language** follows the browser locale. Quick switch for signed-in
  screens: `localStorage["spantail.lang"] = "ja" | "en"` and reload. Full
  locale switch (logged-out screens, and the Accept-Language header that
  server-side language defaults read) via Playwright `browser_run_code_unsafe`:
  `page.addInitScript` overriding `navigator.language`/`languages` and
  removing `spantail.lang`, plus
  `page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" })`, then
  navigate.

## Inspecting local D1 directly

Run from `apps/web` (binding name is `spantail-db`, NOT `spantail`):

```bash
npx wrangler d1 execute spantail-db --local --json \
  --command "SELECT ..."
```

## Gotchas

- Re-seeding needs a clean database: `pnpm db:reset && pnpm db:seed`
  (seeding on top of existing rows fails on unique constraints).
- When driving the UI with browser automation: snapshots of the home page are
  huge — navigate straight to the target route and scope snapshots to the
  element of interest (e.g. `[role="dialog"]`).
- UI language follows the browser locale, so accessibility labels/text in
  snapshots may not be English; i18n catalogs live in
  `apps/web/src/client/i18n/{en,ja}.json`.
- `.playwright-mcp/` output dirs are gitignored.
