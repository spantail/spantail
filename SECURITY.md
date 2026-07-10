# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub's
[private vulnerability reporting](https://github.com/spantail/spantail/security/advisories/new),
which opens a draft advisory only you and the maintainers can see. If you cannot use it, email
<security@spantail.com>.

A report is most useful when it says which version or commit you tested, what an attacker can
actually do with the flaw, and how to reproduce it. A proof of concept helps; a scanner's raw
output usually does not.

We aim to acknowledge a report within three working days. Spantail is maintained by a small team,
so please allow for that — we would rather answer you properly than quickly. You will hear from us
before we publish anything, and we will credit you in the advisory unless you ask us not to.

## Supported versions

Spantail is pre-1.0. Security fixes land on `main` and go out in the next release; we do not
backport them to earlier versions. If you self-host, run the latest release.

## Scope

Spantail is software you run yourself, so the boundary matters. A flaw in this repository's code
or in the defaults it ships is in scope. How a particular instance is deployed — its Cloudflare
account, its secrets, its access rules — is the operator's responsibility, and a finding there
belongs with that operator rather than here.

Two areas deserve care because Spantail is built around them: it ingests untrusted content from AI
agents, and it renders user-authored report templates. [`docs/security.md`](docs/security.md)
describes the threat model, the trust boundaries, and the invariants that hold them — read it
before deciding whether something is a vulnerability or a documented property.
