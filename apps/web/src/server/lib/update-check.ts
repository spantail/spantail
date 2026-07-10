import { type InstanceVersion, isNewerVersion } from "@spantail/core";

// Upstream repo whose GitHub releases define "the latest Spantail". A
// self-hosted instance — whether cloned or forked — checks against upstream so
// its admins learn when a newer Spantail is published. Matches the About page's
// repo link.
const RELEASES_LATEST_URL =
	"https://api.github.com/repos/spantail/spantail/releases/latest";

// ~6h edge cache: regardless of how many admins open the About page, GitHub is
// queried at most about once per this interval per edge, keeping the check from
// generating wasteful outbound requests.
const CACHE_TTL_SECONDS = 21_600;

// The single outbound choke point for the update check. Tests replace it via
// setUpdateCheckFetchForTests — vitest-pool-workers runs the tests and the
// worker in one isolate, so module-level injection touches no real network (the
// installed pool version exports no fetchMock).
type FetchLike = typeof fetch;
let fetchImpl: FetchLike | null = null;

export function setUpdateCheckFetchForTests(impl: FetchLike | null): void {
	fetchImpl = impl;
}

/**
 * Resolves the instance's version standing: its running `current` version, the
 * latest upstream release `tag_name`, and whether an upgrade is available.
 * Best-effort — a self-hosted instance may block outbound traffic or be
 * offline, so any failure reports "no update" rather than surfacing an error.
 */
export async function checkForUpdate(
	current: string,
): Promise<InstanceVersion> {
	const doFetch = fetchImpl ?? globalThis.fetch;
	try {
		const res = await doFetch(RELEASES_LATEST_URL, {
			headers: {
				accept: "application/vnd.github+json",
				"x-github-api-version": "2022-11-28",
				// GitHub rejects requests without a User-Agent.
				"user-agent": "spantail",
			},
			cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
		});
		if (!res.ok) return { current, latest: null, updateAvailable: false };
		const body = (await res.json()) as { tag_name?: unknown };
		const latest = typeof body.tag_name === "string" ? body.tag_name : null;
		return {
			current,
			latest,
			updateAvailable: latest ? isNewerVersion(latest, current) : false,
		};
	} catch {
		return { current, latest: null, updateAvailable: false };
	}
}
