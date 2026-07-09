# Open core: what is free and what is paid

Spantail is an open-core project. This page explains where the line between the open-source
core and the commercial Enterprise Edition (EE) runs, the principle we use to draw it, and the
promises we make about what will never leave the core. It is written for contributors — so you
can tell, before you invest in a feature, which side of the line it will land on.

It does not cover pricing, a feature-by-feature comparison table, or the EE roadmap.

## The model

This repository — `spantail/spantail` — is [MIT](../LICENSE) licensed, permanently and in
full. There is no `ee/` directory here, no license carve-out for a subset of files, and no
license key that unlocks behavior at run time. Everything in this tree is free software, and a
build of this tree is a *complete product*, not a demo of a paid one: it scales, it runs
wherever you deploy it, and it holds all of your data.

Enterprise Edition is a separate, private, commercially licensed codebase that *adds* an
organizational layer on top of this one. It is distributed to Enterprise customers, who deploy
a build that includes it. It never subtracts anything from the core.

## The principle

**We gate on capability, not on who you are.**

Spantail is free for anyone to use, at any scale, for any purpose, commercial or not. We do not
have a "personal use" license, a company-size limit, a seat cap, or a revenue threshold. What
you pay for is a set of *capabilities* that organizations need in order to govern how a tool is
used across many teams — and that individuals and small teams generally do not.

Put simply: **the platform is free; organizational governance and product-run automation are
paid.** If a feature makes Spantail faster, more portable, or more capable of holding your
work, it belongs in the core. If it exists so that an administrator can enforce, audit, or
automate something across an organization, it is a candidate for EE.

## Areas we plan to build as Enterprise Edition

These are areas, not a feature list. The individual features inside them are not settled, and
we will decide them driven by real need rather than by a roadmap written in advance. What is
settled is the shape of each area — and, just as importantly, what stays in the core alongside
it.

- **Enterprise SSO.** Federation against a corporate identity provider: SAML 2.0 / OIDC, SCIM
  provisioning, and the ability to require SSO. *Signing in stays free* — email and password,
  plus social login with Google and GitHub, are core, and always will be.
- **Audit.** Streaming the audit log to an external SIEM, long retention, and fine-grained
  API-level events.
- **Advanced analytics and insights.** Exploratory dashboards, cross-project and cross-team
  aggregation, long-term trends, and AI-driven analysis of your work and agent activity.
  *Report templates and basic rollups and statistics stay free* — the line here is basic
  versus advanced.
- **Content governance and DLP.** Server-side detection of secrets and sensitive content at
  ingest, operator-defined policy enforcement, and audited exception approval. *Structural
  safety stays free* — Spantail does not forward your raw captured data anywhere, and the
  best-effort client-side warnings in the CLI, MCP server, and agent hooks are core.
- **Built-in automation.** A scheduler for recurring reports, a trigger and rule engine, and
  the operational surface around them: execution history, retries, failure notification, and
  organization-wide management. *Manual and do-it-yourself automation stays free* — sending a
  report by hand, outbound webhooks, and driving Spantail from your own cron job through the
  API, CLI, or MCP are all core, and will not be gated. The line here is not basic versus
  advanced but *you run it* versus *the product runs it for you*.

## Promises

These commitments are load-bearing. We would rather forgo revenue than break one.

- **Exporting your data is always free.** Bulk export in open formats is a core feature. You
  can leave whenever you want, and take everything with you.
- **Signing in is always free.** We will not charge you for the ability to log in securely.
  (Enterprise identity federation is a different capability, and is paid.)
- **Scale and portability are always free.** Running Spantail fast, running it large, and
  running it on the infrastructure of your choice are never behind a paywall.
- **Security fixes always ship to the core.** What Enterprise customers pay for is speed,
  advance notice, and backports — never the fix itself. We will not hold a vulnerability fix
  hostage.
- **We will not move a feature out of the core.** Once a capability ships in this repository,
  it stays here. This holds whether we built it or you did.

## When we are not sure

The five promises above are asymmetric on purpose, and it is worth being honest about what
that asymmetry does to us.

Moving a feature *down* — from EE into the core — costs us revenue but hurts nobody. Moving one
*up* is something we have promised never to do, because it would break the trust of everyone
who already relies on it. Since only one of those two directions is available to us, an
unshipped feature in a genuinely ambiguous area starts on the EE side, where the decision is
still reversible. When adoption tells us we drew the line in the wrong place, we move the
feature down — and we have made that easy for ourselves to do.

This means the areas above may shrink over time. They will not grow into what is already here.

## For contributors

Contributions to this repository are, and remain, MIT licensed, and the promises above cover
them: what you contribute here stays here, free for everyone, no matter who wrote it.

Enterprise builds are built on top of this repository, so MIT-licensed core code — yours
included — ships inside them. That is what "adds a layer on top" means, and the MIT license
permits it. What will not happen is your contribution being taken out of the core, or becoming
something anyone has to pay for. Enterprise Edition itself is developed separately and does not
accept external contributions.

If you are considering a substantial feature that touches one of the areas above — or that you
suspect might — **please open a [Discussion](https://github.com/spantail/spantail/discussions)
before you write the code.** We will tell you plainly which side of the line it falls on before
you invest your time, and if the answer is "core," we would love your help building it. Small
fixes and clear improvements never need this — see [`CONTRIBUTING.md`](../CONTRIBUTING.md) for
the normal workflow.

Everything outside those five areas is core, and it is where nearly all of Spantail lives.
