# Releasing

The canonical reference for **how Spantail is versioned and released**. It is a companion to
[`CONTRIBUTING.md`](../CONTRIBUTING.md) (how we work) and [`conventions.md`](./conventions.md)
(conventions and Definition of Done); where a rule lives there, this doc links rather than restating it.

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
  with the product version; the git tag is authoritative. The one exception is `packages/cli`, whose
  `version` is the npm version of the published `spantail` CLI — a separate axis, described below.

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

## Releasing the CLI

The `spantail` CLI is published to npm on its **own track**: `cli-vX.Y.Z` tags, versioned by
`packages/cli/package.json`. Its version says nothing about the server version — the two are
independent, joined only by the `/api/v1` contract (see
[`conventions.md`](./conventions.md)). SemVer here describes the CLI's own commands and output.

1. Bump `version` in `packages/cli/package.json` and commit it on `main`.
2. Tag that commit and push:
   ```bash
   git tag cli-vX.Y.Z
   git push origin cli-vX.Y.Z
   ```
3. The [`Release CLI` workflow](../.github/workflows/cli-release.yml) refuses to publish unless the
   tag matches the declared version, then runs `lint` / `typecheck` / `test` and publishes.

There is no GitHub Release and no `CHANGELOG.md` for the CLI: npm's version list is the record.

Publishing uses npm **trusted publishing** — no `NPM_TOKEN` secret. npm mints a short-lived token
from the workflow's OIDC identity and attaches a provenance attestation. This binds the npm package
to one workflow file **by name**, so `.github/workflows/cli-release.yml` must not be renamed; the
trusted publisher registered on npmjs.com for the `spantail` package names it exactly.

When the CLI starts relying on an endpoint or field that only a newer server provides, raise
`MIN_SERVER_VERSION` in `packages/cli/src/version.ts` in the same change. The CLI warns (never
blocks) when it is pointed at a server older than that.

## Deploying

A tag (a release) and a deploy are **independent** steps; the repository is instance-agnostic.

- **App (`apps/web`)** — deploying to your own Cloudflare account is a self-hosting task. See the
  Setup guide in the [documentation](../apps/docs). The project does not deploy any specific
  instance from this repository. For the hands-on commands — including the **migration-bearing
  upgrade** flow and backup/rollback — see [`deploy.md`](./deploy.md).
- **Docs (`apps/docs`)** — a **separate lifecycle**: not part of `v*` version tags. Every change to
  `apps/docs/**` on `main` deploys automatically to docs.spantail.com via the
  [`Deploy docs` workflow](../.github/workflows/docs-deploy.yml) (needs the `CLOUDFLARE_API_TOKEN`
  and `CLOUDFLARE_ACCOUNT_ID` repository secrets; the optional `CF_BEACON_TOKEN` secret enables
  Cloudflare Web Analytics).
