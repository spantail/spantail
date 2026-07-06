/**
 * Git remote URL normalization, shared by the server (UC2 remote matching)
 * and mirroring the semantics of the Claude Code hook's `normalize_repo_url`
 * (plugins/claude-code/hooks/transcript-to-events.jq): scp-like ssh forms
 * become https, URL userinfo is stripped (an https remote can embed
 * credentials which must never be stored), and a trailing `.git` is dropped.
 * Anything that doesn't come out as http(s) — e.g. a local-path remote — is
 * rejected: it isn't a repository URL and may leak private paths.
 */
export function normalizeRemoteUrl(url: string): string | null {
	const normalized = url
		.trim()
		.replace(/^git@([^:/]+):/, "https://$1/")
		.replace(/^ssh:\/\/(?:[^/@]*@)?/, "https://")
		.replace(/^(https?:\/\/)[^/@]*@/, "$1")
		.replace(/\.git$/, "");
	return /^https?:\/\//.test(normalized) ? normalized : null;
}

/**
 * Extracts `owner/repo` (lowercased) from a github.com remote URL. Non-GitHub
 * hosts return null — GHES is out of scope for v1. Full names are lowercased
 * because GitHub treats them case-insensitively and the mapping table stores
 * the lowercase form as its unique key.
 */
export function repoFullNameFromUrl(url: string): string | null {
	const normalized = normalizeRemoteUrl(url);
	if (!normalized) return null;
	const match = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/?$/.exec(
		normalized,
	);
	if (!match) return null;
	return `${match[1]}/${match[2]}`.toLowerCase();
}

/** The canonical https URL of a repo, as stored in agent-entry context. */
export function repoUrlFromFullName(fullName: string): string {
	return `https://github.com/${fullName}`;
}

/**
 * Picks the first remote (in array order — deterministic for forks/multiple
 * remotes, per issue #159) whose repo resolves to a mapped full name.
 */
export function matchRemoteToMapping(
	remotes: string[],
	mappedFullNames: string[],
): { fullName: string } | null {
	const mapped = new Set(mappedFullNames.map((name) => name.toLowerCase()));
	for (const remote of remotes) {
		const fullName = repoFullNameFromUrl(remote);
		if (fullName && mapped.has(fullName)) return { fullName };
	}
	return null;
}
