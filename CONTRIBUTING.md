# Contributing to Spantail

Thanks for your interest in contributing! This guide covers **how we work** — where to discuss
ideas, how to file issues, and how to open pull requests. For project conventions and local
development, see the links below rather than this page (we keep a single source of truth):

- **Dev setup & commands** — [`README.md`](README.md) ("Getting started" / "Development").
- **Coding conventions & Definition of Done** — [`CLAUDE.md`](CLAUDE.md).

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
[`CLAUDE.md`](CLAUDE.md), not in each issue.

## Labels

Labels sit on a few independent axes. You rarely need to apply one yourself:

- **Type** — `bug`, `enhancement`, `documentation`, `chore`, `ci`. Applied automatically: issue
  forms set it when you file, and a workflow keeps every PR's type label in sync with its
  Conventional Commits title prefix (so don't hand-pick type labels on PRs — retitle instead).
  Release notes are grouped from these.
- **Area** (`area:*`) — which part of the product an issue touches. Maintainers apply these;
  use them to find issues in a part of the codebase you know.
- **Status** — triage state: `needs-triage` (set automatically on new issues), `needs-repro`,
  `needs-info`, `blocked`. Maintainers update these as an issue moves.
- **Contribution** — [`good first issue`](https://github.com/spantail/spantail/contribute) and
  `help wanted` mark issues we'd love a hand with.

`security` marks hardening work that is safe to discuss publicly. **Do not** file an issue for a
suspected vulnerability — use
[private vulnerability reporting](https://github.com/spantail/spantail/security) instead.

## Pull requests

Open a PR against `main`. Keep **one PR = one logical change** — don't mix unrelated work.

**Title:** use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
`docs:`, `refactor:`, …), matching the convention in [`CLAUDE.md`](CLAUDE.md).

**Body:** the PR template prefills these sections —

- **Motivation / Context** — why; link the issue with `Closes #NN`.
- **Summary of changes** — what changed.
- **Review points** — where you'd like reviewers to focus.
- **How to test** — steps and results so a reviewer can verify.

Before requesting review, make sure the change meets the **Definition of Done** in
[`CLAUDE.md`](CLAUDE.md) — including `pnpm typecheck && pnpm lint && pnpm test` passing, generated
migrations if the schema changed, and UI strings present in both `en` and `ja`.

Reviewers triage with labels; maintainers may adjust labels and scope during review.
