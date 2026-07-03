---
title: System settings
description: Configure email delivery, social login, the AI agents feature, and realtime updates.
---

The **System** group in Settings holds the instance-wide switches. Every screen here is **instance
admin only**, except **About**, which is visible to everyone.

The credentials these features depend on — SMTP/email routing and OAuth client secrets — are set
once at deploy time as environment secrets, not in this UI. See
[Configuration](/self-hosting/configuration) in the Setup Guide.

## Email

**Settings → System → Email.** Controls whether Spantail sends mail (invitations, password
resets, report delivery).

- **Enable email** — turn delivery on or off.
- **From address** — the sender address (required to enable delivery).
- **From name** — an optional friendly sender name.

You cannot enable email without a From address — that guard prevents invitations from failing at
send time. When email is **off**, user onboarding switches to direct account creation with a
one-time temporary password instead of emailed invitations (see
[User management](/admin/users#adding-users)).

:::note[Screenshot]
*Placeholder — the Email settings page with the enable toggle and the From address/name fields.*
:::

## Social login

**Settings → System → Social login.** Lets users sign in with **Google** or **GitHub** in
addition to email and password.

- **Per-provider toggle** — enable Google and GitHub independently. A provider can only be enabled
  once its credentials are present in the environment; until then the toggle stays disabled with a
  hint.
- **Allowed email domains (Google)** — optionally restrict Google sign-in to one or more domains
  (comma- or newline-separated). Leave empty to allow any Google account.

:::note[Screenshot]
*Placeholder — the Social login page with the Google and GitHub toggles and the allowed-domains field.*
:::

Social login stays unavailable until the instance has its first admin — a deliberate safeguard so
nobody can claim the instance through social sign-in before it is set up. See
[Security](/self-hosting/security) for the bootstrap rules.

## AI agents

**Settings → System → AI agents.** A single switch for the agent-activity feature.

- **On** — users can create agents and the **Account → Agents** screen appears for them, so AI
  agents can ingest their activity as spans.
- **Off** — the agents UI is hidden and no new agents can be created.

:::note[Screenshot]
*Placeholder — the AI agents page with the feature toggle.*
:::

## Realtime updates

**Settings → System → Realtime updates.** A single switch for live updates over Server-Sent
Events.

- **On** — open browser tabs receive changes (new entries, projects, reports, messages) the
  moment they happen, without a reload.
- **Off** (default) — screens still refresh whenever a tab regains focus; nothing is pushed in
  between.

The switch exists because every connected tab keeps a per-user Durable Object running, and that
duration counts against your Cloudflare account's daily quota — on the **Workers Free plan** a
handful of active users can exhaust it within hours. Enable it on a Workers Paid plan, or on the
Free plan when only a few people use the instance. Turning it off applies to new connections;
already-open tabs keep their stream until they reload.

:::note[Screenshot]
*Placeholder — the Realtime updates page with the feature toggle.*
:::

## About

**Settings → System → About.** Unlike the rest of System, **this page is visible to every user**,
not just instance admins — so anyone can see which version the instance runs.

It shows the product name, the running **Version** (linked to the matching GitHub release), and the
**Copyright**. There is nothing to configure here.

:::note[Screenshot]
*Placeholder — the About page showing the product name, version, and copyright.*
:::
