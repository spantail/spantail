---
title: System settings
description: Configure email delivery, social login, and the AI-agents feature.
---

The **System** group in Settings holds the instance-wide switches. Every screen here is **instance
admin only**.

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
