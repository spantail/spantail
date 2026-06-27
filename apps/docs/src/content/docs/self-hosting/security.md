---
title: Security
description: Secure-by-default behavior and self-hosting hardening.
---

Spantail is run by self-hosters, so an insecure default would be an insecure deployment. This
page summarizes the operator-facing parts of the security model. The full threat model is the
[`docs/security.md`](https://github.com/spantail/spantail/blob/main/docs/security.md) source of
truth in the repository.

## Fail closed by default

- The **session-signing secret is validated at startup**. If `BETTER_AUTH_SECRET` is missing or
  shorter than 32 characters, the Worker errors rather than signing forgeable sessions.
- **Optional integrations stay disabled until fully configured.** OAuth providers and email are
  unavailable unless their credentials are set — there is no half-configured surface.
- **`wrangler.jsonc` carries only non-secret IDs.** Secrets come from `wrangler secret` or
  `.dev.vars` (gitignored), never the repository.

## Captured content may be sensitive

Span descriptions, notes, and event payloads are stored **verbatim** and can surface downstream
in reports, public share links, and Send-to deliveries. Treat them as potentially
secret-bearing:

- Don't put secrets in those fields, and don't emit secrets into agent logs.
- The reference Claude Code hook sends only compact **telemetry** (token usage and timing) —
  never your conversation transcripts or source code.

## Sharing is a capability URL

A public report share is reachable by **knowing its token** — there is no logged-in session
behind it, so the URL is a bearer secret. Shares are revocable, expirable, and can carry an
optional passcode. Because a stored snapshot is not re-filtered against live access, **revoke
existing shares when membership changes** if the historical content is sensitive.

## Harden the repository (if you fork)

On a public or forkable repository, enable — both free on public repos:

- **GitHub secret scanning** (detects credentials already in the repo and its history), and
- **push protection** (blocks a recognized secret from being pushed in the first place).

Register a custom pattern for Spantail's own token formats so a leaked instance token is caught:

```
spantail_(pat|aat)_[A-Za-z0-9_-]{43}
```

## Learn more

- [`docs/security.md`](https://github.com/spantail/spantail/blob/main/docs/security.md) — the full threat model.
- [`docs/permissions.md`](https://github.com/spantail/spantail/blob/main/docs/permissions.md) — who can read and write each resource.
