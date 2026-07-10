# Contributing to Spantail

Thanks for your interest in contributing! This guide covers **how we work** — where to discuss
ideas, how to file issues, and how to open pull requests. For project conventions and local
development, see the links below rather than this page (we avoid duplicating them):

- **Dev setup** — [`README.md`](README.md) ("Getting started").
- **Commands, coding conventions & Definition of Done** — [`docs/conventions.md`](docs/conventions.md).

Contributions, issues, and pull requests are in **English**.

## Where to start: Discussions vs Issues

We split the funnel by maturity. Pick the lighter-weight place that fits:

- **Big-picture, direction, or uncertain ideas → [Discussions](https://github.com/spantail/spantail/discussions).**
  Use the **Ideas** category to propose and shape a feature before any code exists, and **Q&A**
  to ask for help. Direction is settled here so issues stay focused on agreed work.
- **Implementation-ready, agreed work → an Issue.** Once the *what* and rough *how* are clear,
  open an issue to track the implementation.
- **Small, obvious changes → straight to an Issue or PR.** Typos, clear bugs, and minor,
  uncontroversial improvements don't need a Discussion first — don't over-gate them.

When in doubt, start a Discussion. It's cheaper to realign there than after code is written.

## Core vs Enterprise Edition

Spantail is open core: this repository is MIT licensed in full, and a few areas — enterprise
SSO, audit, advanced analytics, content governance, and built-in automation — are planned as a
separately distributed, commercial Enterprise Edition.
[`docs/open-core.md`](docs/open-core.md) explains the principle we use to draw that line, what
stays free in each of those areas, and the promises we make about never moving a feature out of
the core.

If you're planning a substantial feature that touches one of those areas, open a Discussion
first and we'll tell you which side of the line it falls on before you write any code. What you
contribute here stays MIT and stays in the core: Enterprise builds sit on top of this
repository rather than taking anything out of it.

## Filing issues

Use the issue forms (the "New issue" button offers **Bug report** and **Feature request**). A good
feature request mirrors the form's structure:

- **Summary** — what this is, in one or two sentences.
- **Motivation / use cases** — why it's worth doing; concrete scenarios.
- **Non-goals** — what this explicitly does *not* cover (keeps scope honest).
- **Proposed design** *(non-binding)* — an optional sketch to start discussion. It is **not** a
  commitment; reviewers and implementers may change it.
- **Acceptance criteria** — observable, behavior-based conditions for "done".
- **Open questions** — unresolved decisions.

Keep it behavior-focused. Contributor-workflow details (typecheck/lint/test, migrations) live in
[`docs/conventions.md`](docs/conventions.md), not in each issue.

## Labels

Labels sit on a few independent axes. You rarely need to apply one yourself:

- **Type** — `bug`, `enhancement`, `documentation`, `chore`, `ci`. Applied automatically: issue
  forms set it when you file, and a workflow keeps every PR's type label in sync with its
  Conventional Commits title prefix (so don't hand-pick type labels on PRs — retitle instead).
  Release notes are grouped from these.
- **Area** (`area:*`) — which part of the product an issue touches. Maintainers apply these;
  use them to find issues in a part of the codebase you know.
- **Status** — triage state: `needs-triage` (set automatically on new issues), `needs-repro`,
  `needs-info`, `blocked`. A maintainer drops `needs-triage` once the issue carries a type and an
  area label, which is the signal that it has been read and accepted as described.
- **Contribution** — [`help wanted`](https://github.com/spantail/spantail/labels/help%20wanted)
  marks issues we'd welcome a hand with, at any size.
  [`good first issue`](https://github.com/spantail/spantail/contribute)
  narrows that to the ones we think are a good first contribution: small, self-contained, and
  described well enough to start without asking us first.

`security` marks hardening work that is safe to discuss publicly. **Do not** file an issue for a
suspected vulnerability — [`SECURITY.md`](SECURITY.md) explains how to report one privately.

## Claiming an issue

Say so in a comment before you start, and a maintainer will assign the issue to you. That keeps two
people from building the same thing, and it lets us hand you anything the issue doesn't say.

If an assigned issue goes quiet for two weeks we'll unassign it, so it doesn't sit reserved by
someone who has moved on. Nothing is lost by that — pick it back up whenever you like. Life gets in
the way, and a stalled issue is fine; an issue nobody else can take is not.

## Pull requests

Open a PR against `main`. Keep **one PR = one logical change** — don't mix unrelated work.

**Title:** use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
`docs:`, `refactor:`, …), matching the convention in [`docs/conventions.md`](docs/conventions.md).

**Body:** the PR template prefills these sections —

- **Motivation / Context** — why; link the issue with `Closes #NN`.
- **Summary of changes** — what changed.
- **Review points** — where you'd like reviewers to focus.
- **How to test** — steps and results so a reviewer can verify.

### Sign your commits (DCO)

Every commit must carry a `Signed-off-by` trailer. Add one with the `-s` flag:

```bash
git commit -s -m "feat: ..."
```

`-s` (`--signoff`) appends a line naming you from your git config. It is **not** `-S`, which
makes a GPG signature — we don't require that. Signing off certifies the
[Developer Certificate of Origin](https://developercertificate.org/) — the [`DCO`](DCO) file at
the repository root — a lightweight statement that you wrote the change, or otherwise have the
right to submit it under this project's license. It's how we keep the provenance of every line
in Spantail on the record, in place of a contributor license agreement.

The `DCO` status check fails a pull request if **any** commit on it is missing the trailer. If
you forgot:

```bash
git commit --amend -s --no-edit    # the last commit
git rebase --signoff origin/main   # every commit on the branch
```

Then `git push --force-with-lease`. Merge commits are exempt.

Before requesting review, make sure the change meets the **Definition of Done** in
[`docs/conventions.md`](docs/conventions.md) — including `pnpm typecheck && pnpm lint && pnpm test`
passing, generated migrations if the schema changed, and UI strings present in both `en` and `ja`.

Reviewers triage with labels; maintainers may adjust labels and scope during review.

## Documentation and translations

The documentation site ([`apps/docs`](apps/docs)) ships in English and Japanese. **English is the
source of truth**: a page is written in English first, and the Japanese version follows it.

**Write documentation in English only.** A docs pull request does not need a Japanese counterpart,
and reviewers will not ask you for one. Improve the English page; we translate it afterwards. If
you do speak Japanese and want to translate, that is welcome — as a *separate* pull request, so
that a change to the content and a change to its translation can be reviewed independently. Title
it `docs(ja):`.

One exception, and it is not a documentation one. UI strings live in i18n catalogs
(`apps/web/src/client/i18n/{en,ja}.json`) and **must be added to both** in the same change: a key
missing from a catalog is a bug the user sees, not a page waiting to be translated. That rule is
part of the [Definition of Done](docs/conventions.md).

*For maintainers:* Starlight falls back to English per **page**, not per section. A new English
page with no Japanese twin renders in English with a translation notice — safe to merge alone. A
new *section* added to a page that already has a Japanese twin does not fall back: it is simply
absent from the Japanese page until someone adds it.
