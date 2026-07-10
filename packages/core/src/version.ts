// A product version as `git describe --tags` reports it: a clean release tag
// (`v0.1.0`), an off-tag build (`v0.1.0-7-gabc`), or `unknown` when the build
// had no git history. Only the first form is comparable.
const SEMVER = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * True only when `latest` is a strictly newer clean `vX.Y.Z` than `current`.
 * Any non-release `current` (an off-tag build like `v0.1.0-7-gabc`, or
 * `"unknown"`) or an unparseable `latest` yields false, so an instance built
 * from a clone or fork that doesn't publish semver tags stays silent.
 */
export function isNewerVersion(latest: string, current: string): boolean {
	const l = SEMVER.exec(latest);
	const c = SEMVER.exec(current);
	if (!l || !c) return false;
	for (let i = 1; i <= 3; i++) {
		const a = Number(l[i]);
		const b = Number(c[i]);
		if (a !== b) return a > b;
	}
	return false;
}
