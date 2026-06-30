# Releasing

The single source of truth for **how Spantail is versioned and released**. It is a companion to
[`CONTRIBUTING.md`](../CONTRIBUTING.md) (how we work) and [`CLAUDE.md`](../CLAUDE.md) (conventions
and Definition of Done); where a rule lives there, this doc links rather than restating it.

## Versioning (SemVer)

The product — the app and its libraries as a whole — is versioned with [Semantic
Versioning](https://semver.org/), tracked by **git tags `vX.Y.Z`** plus a **GitHub Release** per
tag. The git tag is the source of truth for the product version, and the auto-generated GitHub
Release notes are the source of truth for the changelog (there is no `CHANGELOG.md`).

Starting at **`v0.1.0`**. Bump rules:

- **patch** (`v0.1.0` → `v0.1.1`) — small improvements and bug fixes.
- **minor** (`v0.1.0` → `v0.2.0`) — new features. **While in `0.x`, breaking changes are also a
  minor bump** (the SemVer `0.x` convention: nothing is guaranteed stable yet).
- **major** — reserved for **`v1.0.0`**, the first stable release / public GA, where we commit to a
  stable API and schema. Do not bump major before then.

Notes:

- The per-package `version` fields in the monorepo (`apps/*`, `packages/*`) are **not** kept in sync
  with the product version; the git tag is authoritative.
- The `spantail` CLI will get its own npm-published versioning (via changesets) when it is
  published. That is a separate axis and out of scope here.

## Cutting a release

1. Ensure `main` is green (CI passing) and includes everything for this release.
2. Pick the next version per the rules above.
3. Tag the release commit on `main` and push the tag:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. The [`Release` workflow](../.github/workflows/release.yml) re-runs `lint` / `typecheck` / `test`
   on the tagged commit, then creates the GitHub Release with auto-generated notes. Review and
   polish the notes.

Release notes are generated from merged PRs and grouped by label
([`.github/release.yml`](../.github/release.yml)), so **label PRs** (`bug`, `enhancement`, …) for
good categorization.

## Deploying

A tag (a release) and a deploy are **independent** steps; the repository is instance-agnostic.

- **App (`apps/web`)** — deploying to your own Cloudflare account is a self-hosting task. See the
  Setup guide in the [documentation](../apps/docs). The project does not deploy any specific
  instance from this repository. For the hands-on commands — including the **migration-bearing
  upgrade** flow and backup/rollback — see [`deploy.md`](./deploy.md).
- **Docs (`apps/docs`)** — a **separate lifecycle**: not part of `v*` version tags. Every change to
  `apps/docs/**` on `main` deploys automatically to docs.spantail.com via the
  [`Deploy docs` workflow](../.github/workflows/docs-deploy.yml) (needs the `CLOUDFLARE_API_TOKEN`
  and `CLOUDFLARE_ACCOUNT_ID` repository secrets).
