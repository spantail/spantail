import {
	branchMatchesIssue,
	MAX_LINKED_AGENT_ENTRIES,
	refsMatchIssue,
	repoUrlFromFullName,
} from "@spantail/core";
import { type Database, listAgentEntriesByRepo } from "@spantail/db";

import { GithubApiError, listPullsByHead } from "./api";

/** Only sessions started in this window are linking candidates. */
const CANDIDATE_WINDOW_DAYS = 30;

/** Cap on branch→PR lookups per log call (Workers subrequest budget). */
const MAX_PR_LOOKUPS = 5;

const CLOSES_ISSUE = (issueNumber: number) =>
	new RegExp(
		`(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#${issueNumber}\\b`,
		"i",
	);

/**
 * Finds the caller's agent sessions attributable to (repo, issue#) at log
 * time — the snapshot linking of issue #159 (late-arriving sessions are out
 * of scope). Signals in precision order, first hit links a candidate:
 *
 *  A. `context.refs` carries `github:{repo}#{N}` (from pr-link sidecars).
 *  B. A branch name follows an issue-number convention.
 *  C. A branch resolves to a PR that is #N or declares it closes #N —
 *     App-token gated, capped, and best-effort (API failures skip C).
 *
 * Linking never fails the log; the worst case is an unlinked entry.
 */
export async function resolveLinkableAgentEntries(opts: {
	db: Database;
	userId: string;
	workspaceId: string;
	repoFullName: string;
	issueNumber: number;
	/** Installation token when the App covers the repo; null degrades to A+B. */
	installationToken: string | null;
	now?: Date;
}): Promise<string[]> {
	const now = opts.now ?? new Date();
	const repoUrl = repoUrlFromFullName(opts.repoFullName);
	const candidates = await listAgentEntriesByRepo(opts.db, {
		workspaceId: opts.workspaceId,
		ownerUserId: opts.userId,
		repoUrl,
		since: new Date(now.getTime() - CANDIDATE_WINDOW_DAYS * 86_400_000),
	});

	const linked: string[] = [];
	const unresolvedBranches = new Map<string, string[]>();

	for (const entry of candidates) {
		const context = entry.context;
		// The LIKE in the query is only a prefilter; require the repo URL in the
		// repositories facet specifically.
		if (
			!context?.repositories?.some(
				(url) => url.toLowerCase() === repoUrl.toLowerCase(),
			)
		) {
			continue;
		}
		if (refsMatchIssue(context.refs, opts.repoFullName, opts.issueNumber)) {
			linked.push(entry.id);
			continue;
		}
		const branches = context.branches ?? [];
		if (branches.some((b) => branchMatchesIssue(b, opts.issueNumber))) {
			linked.push(entry.id);
			continue;
		}
		for (const branch of branches) {
			const ids = unresolvedBranches.get(branch);
			if (ids) ids.push(entry.id);
			else unresolvedBranches.set(branch, [entry.id]);
		}
	}

	// Signal C: newest-first branch→PR resolution for what A/B left behind.
	if (opts.installationToken && unresolvedBranches.size > 0) {
		const owner = opts.repoFullName.split("/")[0] ?? "";
		let lookups = 0;
		for (const [branch, entryIds] of unresolvedBranches) {
			if (lookups >= MAX_PR_LOOKUPS) break;
			if (entryIds.every((id) => linked.includes(id))) continue;
			lookups++;
			try {
				const pulls = await listPullsByHead(
					opts.installationToken,
					opts.repoFullName,
					owner,
					branch,
				);
				const matches = pulls.some(
					(pull) =>
						pull.number === opts.issueNumber ||
						CLOSES_ISSUE(opts.issueNumber).test(pull.title) ||
						(pull.body !== null &&
							CLOSES_ISSUE(opts.issueNumber).test(pull.body)),
				);
				if (matches) {
					for (const id of entryIds) {
						if (!linked.includes(id)) linked.push(id);
					}
				}
			} catch (error) {
				// Best-effort: a failed lookup — HTTP status or network — only
				// loses a candidate link, never the log itself.
				if (!(error instanceof GithubApiError)) {
					console.error("github pr lookup failed", error);
				}
			}
		}
	}

	return linked.slice(0, MAX_LINKED_AGENT_ENTRIES);
}
