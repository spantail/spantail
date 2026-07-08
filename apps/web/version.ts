import { execSync } from "node:child_process";

// The running instance's product version, resolved from git at build time. The
// `vX.Y.Z` tag is the source of truth (see docs/releasing.md); on a clean tag
// `git describe` yields e.g. "v0.1.0", off-tag "v0.1.0-7-gfe9cc5b". Builds
// without git history fall back to "unknown". Shared by the Vite build and the
// test build so `__APP_VERSION__` resolves the same way in both.
export function resolveAppVersion(): string {
	try {
		return execSync("git describe --tags --always --dirty", {
			encoding: "utf8",
		}).trim();
	} catch {
		return "unknown";
	}
}
