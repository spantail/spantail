import {
	branchMatchesIssue,
	MAX_LINKED_AGENT_ENTRIES,
	refsMatchIssue,
	repoUrlFromFullName,
} from "@spantail/core";
import {
	type Database,
	listAgentEntriesByRepo,
	listAgentEntriesBySession,
} from "@spantail/db";

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

/** A linkable session and the material the note builder reuses. */
export interface LinkableAgentEntry {
	id: string;
	description: string | null;
}

/**
 * Finds the caller's agent sessions attributable to (repo, issue#) at log
 * time — the snapshot linking of issue #159 (late-arriving sessions are out
 * of scope). Signals in precision order, first hit links a candidate:
 *
 *  S. The session the caller is logging from right now (`sessionId`) —
 *     independent of repo and branch, since a live session gets its refs
 *     only at SessionEnd.
 *  A. `context.refs` carries `github:{repo}#{N}` (from pr-link sidecars).
 *  B. A branch name follows an issue-number convention.
 *  C. A branch resolves to a PR that is #N or declares it closes #N —
 *     App-token gated, capped, and best-effort (API failures skip C).
 *
 * The returned order is this precision order, so a downstream cap (or the
 * note builder's length cut) drops the least-precise links first.
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
	/** The caller's current external session id, when logging from inside one. */
	sessionId?: string;
	now?: Date;
}): Promise<LinkableAgentEntry[]> {
	const now = opts.now ?? new Date();
	const repoUrl = repoUrlFromFullName(opts.repoFullName);
	const candidates = await listAgentEntriesByRepo(opts.db, {
		workspaceId: opts.workspaceId,
		ownerUserId: opts.userId,
		repoUrl,
		since: new Date(now.getTime() - CANDIDATE_WINDOW_DAYS * 86_400_000),
	});

	const linked: LinkableAgentEntry[] = [];
	const linkedIds = new Set<string>();
	const link = (entry: { id: string; description: string | null }) => {
		if (linkedIds.has(entry.id)) return;
		linkedIds.add(entry.id);
		linked.push({ id: entry.id, description: entry.description });
	};
	const unresolvedBranches = new Map<
		string,
		Array<{ id: string; description: string | null }>
	>();

	// Signal S: the query scopes to the caller's own entries in the workspace,
	// which is exactly the linking ACL.
	if (opts.sessionId) {
		const own = await listAgentEntriesBySession(opts.db, {
			workspaceId: opts.workspaceId,
			ownerUserId: opts.userId,
			sessionId: opts.sessionId,
		});
		for (const entry of own) link(entry);
	}

	for (const entry of candidates) {
		if (linkedIds.has(entry.id)) continue;
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
			link(entry);
			continue;
		}
		const branches = context.branches ?? [];
		if (branches.some((b) => branchMatchesIssue(b, opts.issueNumber))) {
			link(entry);
			continue;
		}
		for (const branch of branches) {
			const entries = unresolvedBranches.get(branch);
			if (entries) entries.push(entry);
			else unresolvedBranches.set(branch, [entry]);
		}
	}

	// Signal C: newest-first branch→PR resolution for what S/A/B left behind.
	if (opts.installationToken && unresolvedBranches.size > 0) {
		const owner = opts.repoFullName.split("/")[0] ?? "";
		let lookups = 0;
		for (const [branch, entries] of unresolvedBranches) {
			if (lookups >= MAX_PR_LOOKUPS) break;
			if (entries.every((entry) => linkedIds.has(entry.id))) continue;
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
					for (const entry of entries) link(entry);
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
