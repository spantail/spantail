import { execSync } from "node:child_process";

// The running instance's product version, resolved from git at build time. The
// `vX.Y.Z` tag is the source of truth (see docs/releasing.md); on a clean tag
// `git describe` yields e.g. "v0.1.0", off-tag "v0.1.0-7-gfe9cc5b". Builds
// without git history fall back to "unknown". Shared by the Vite build and the
// test build so `__APP_VERSION__` resolves the same way in both.
//
// Two deploy-path accommodations (issue #254):
// - Workers Builds clones carry no tags, so when describe yields a bare SHA the
//   tags are fetched once and describe retried; any failure keeps the SHA.
// - Dirtiness is computed excluding apps/web/wrangler.jsonc, which the
//   sanctioned deploy-config injection (scripts/inject-deploy-config.mjs)
//   rewrites before every build; a per-instance D1 id must not mark an
//   otherwise pristine release build "-dirty".
const TAGGED = /^v\d+\.\d+\.\d+/;

function describe(): string {
	return execSync("git describe --tags --always", {
		encoding: "utf8",
	}).trim();
}

function isDirty(): boolean {
	// -uno matches `git describe --dirty` semantics (tracked files only); the
	// `top` magic makes the pathspecs repo-root-relative regardless of cwd.
	return (
		execSync(
			"git status --porcelain -uno -- ':(top)' ':(top,exclude)apps/web/wrangler.jsonc'",
			{ encoding: "utf8" },
		).trim() !== ""
	);
}

export function resolveAppVersion(): string {
	try {
		let version = describe();
		if (!TAGGED.test(version)) {
			try {
				execSync("git fetch --tags --force --quiet origin", {
					timeout: 15_000,
					// Keep a failed fetch's "fatal: ..." out of the build log.
					stdio: ["ignore", "pipe", "ignore"],
				});
				version = describe();
			} catch {
				// Offline or no remote: keep the bare-SHA fallback.
			}
		}
		return isDirty() ? `${version}-dirty` : version;
	} catch {
		return "unknown";
	}
}
