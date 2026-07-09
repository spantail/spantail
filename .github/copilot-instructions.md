# Copilot review instructions

Repository-wide guidance for GitHub Copilot when reviewing pull requests in Spantail.

## Before reviewing

- Read the PR body first — especially the **Review points** section. Focus your review where the
  author asked, and confirm the trade-offs and decisions they call out rather than re-opening them.
- Read the repository's key documents and review against them, not against generic preferences:
  - `docs/conventions.md` — conventions, architecture invariants, and the Definition of Done.
  - `docs/permissions.md` — the role × resource access model.
  - `docs/data-model.md` — the entities and how they relate.
  - `docs/report-templates.md` — report-template format and rendering-safety rules.
  - `CONTRIBUTING.md` — contribution workflow and PR expectations.

## How to comment

- Consolidate. Group related feedback into as few comments as possible, and try to surface
  everything in a single review pass instead of across multiple rounds. Don't split one concern
  into many separate line comments.
- Prioritize what matters: correctness, security, permission scoping, and violations of the
  architecture invariants in `docs/conventions.md`. Lead with these.

## What to avoid

- Don't request over-engineering. The project follows YAGNI and DRY — do not ask for speculative
  abstractions, extra config options, defensive code, or generalization that current features
  don't need. The simpler implementation is the preferred one.
- Don't nitpick. Skip purely stylistic or subjective preferences already handled by Biome and
  formatting, trivial naming debates, and minor wording. If it wouldn't block a merge, leave it out.
