/**
 * Heuristics for linking agent sessions to a GitHub issue at log time
 * (issue #159). These are the pure predicates; the candidate query and the
 * branch→PR API fallback live server-side.
 */

/**
 * Whether a branch name follows a recognizable issue-number convention:
 * GitHub's create-branch-from-issue (`123-fix-auth`), prefixed variants
 * (`fix/123-auth`, `feature_123-x`), an explicit `#123`, or an
 * `issue`/`issues`/`gh` marker (`issue-123`, `gh-123`, `fix/issues/123`).
 * A bare number inside a word (`v123-release`) does not match.
 */
export function branchMatchesIssue(
	branch: string,
	issueNumber: number,
): boolean {
	const n = String(issueNumber);
	if (branch === n) return true;
	if (new RegExp(`^${n}[-_]`).test(branch)) return true;
	if (new RegExp(`/${n}[-_]`).test(branch)) return true;
	// Bounded like the other forms: `#12` must not match `#123`.
	if (new RegExp(`#${n}(?:$|\\D)`).test(branch)) return true;
	return new RegExp(
		`(?:^|[/_-])(?:issue|issues|gh)[-/]?${n}(?:$|[/_-])`,
		"i",
	).test(branch);
}

/**
 * Whether an agent entry's `context.refs` carry the exact
 * `github:{owner/repo}#{N}` ref (written by the Claude Code plugin's
 * finalize hook from pr-link sidecars). Full names compare
 * case-insensitively, matching GitHub semantics.
 */
export function refsMatchIssue(
	refs: string[] | undefined,
	fullName: string,
	issueNumber: number,
): boolean {
	if (!refs) return false;
	const want = `github:${fullName.toLowerCase()}#${issueNumber}`;
	return refs.some((ref) => ref.toLowerCase() === want);
}

/**
 * Parses a `github:{owner/repo}#{N}` ref (the format the Claude Code plugin
 * writes into `context.refs`) into its full name and issue/PR number, or null
 * for any other shape. Refs are opaque client-supplied strings, so the match is
 * strict — callers must never build a URL from an unparsed ref.
 */
export function parseGithubRef(
	ref: string,
): { fullName: string; number: number } | null {
	const match = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([0-9]+)$/.exec(
		ref,
	);
	const fullName = match?.[1];
	const number = match?.[2];
	if (fullName === undefined || number === undefined) return null;
	return { fullName, number: Number(number) };
}
