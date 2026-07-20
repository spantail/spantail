import { execFileSync } from "node:child_process";

// The running instance's product version, resolved from git at build time. The
// `vX.Y.Z` tag is the source of truth (see docs/releasing.md); on a clean tag
// `git describe` yields e.g. "v0.1.0", off-tag "v0.1.0-7-gfe9cc5b". Builds
// without git history fall back to "unknown". Shared by the Vite build and the
// test build so `__APP_VERSION__` resolves the same way in both.
//
// Two deploy-path accommodations (issue #254):
// - Deploy clones may carry no release tags — Workers Builds clones none at
//   all, and a self-hosted fork's origin never receives tags created upstream
//   after the fork (Sync fork moves only the branch). When describe yields a
//   bare SHA the tags are fetched once from the canonical repository and
//   describe retried; any failure keeps the SHA.
// - Dirtiness is computed excluding apps/web/wrangler.jsonc, which the
//   sanctioned deploy-config injection (scripts/inject-deploy-config.mjs)
//   rewrites before every build; a per-instance D1 id must not mark an
//   otherwise pristine release build "-dirty".
const TAGGED = /^v\d+\.\d+\.\d+/;
const UPSTREAM_REPO = "https://github.com/spantail/spantail.git";

function git(args: string[]): string {
	return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function describe(): string {
	return git(["describe", "--tags", "--always"]);
}

function isDirty(): boolean {
	// -uno matches `git describe --dirty` semantics (tracked files only); the
	// `top` magic makes the pathspecs repo-root-relative regardless of cwd.
	return (
		git([
			"status",
			"--porcelain",
			"-uno",
			"--",
			":(top)",
			":(top,exclude)apps/web/wrangler.jsonc",
		]) !== ""
	);
}

export function resolveAppVersion(): string {
	try {
		let version = describe();
		if (!TAGGED.test(version)) {
			try {
				execFileSync(
					"git",
					["fetch", "--tags", "--force", "--quiet", UPSTREAM_REPO],
					{
						timeout: 15_000,
						// Keep a failed fetch's "fatal: ..." out of the build log.
						stdio: ["ignore", "pipe", "ignore"],
					},
				);
				version = describe();
			} catch {
				// Offline or unreachable upstream: keep the bare-SHA fallback.
			}
		}
		return isDirty() ? `${version}-dirty` : version;
	} catch {
		return "unknown";
	}
}
