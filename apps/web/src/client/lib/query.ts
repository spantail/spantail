import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
		},
	},
});

/**
 * Refreshes everything derived from a workspace's entries after a mutation:
 * timelines, project lists, stats, and the tag filter catalog (prefix-matched
 * query keys).
 */
export function invalidateWorkEntryData(
	client: QueryClient,
	workspaceId: string,
): void {
	client.invalidateQueries({ queryKey: ["work-entries", workspaceId] });
	client.invalidateQueries({ queryKey: ["work-entry-stats", workspaceId] });
	client.invalidateQueries({ queryKey: ["work-entry-tags", workspaceId] });
}

/**
 * Refreshes everything derived from a workspace's agent activity after a
 * mutation: the session lists (every agent/range/timezone page set), the stats
 * widgets, and the sidebar's active-agents roster (an agent may have lost its
 * last activity).
 */
export function invalidateAgentEntryData(
	client: QueryClient,
	workspaceId: string,
): void {
	client.invalidateQueries({ queryKey: ["agent-entries", workspaceId] });
	client.invalidateQueries({ queryKey: ["agent-entry-stats", workspaceId] });
	client.invalidateQueries({ queryKey: ["workspace-agents", workspaceId] });
	// A deleted session cascades its work-entry links away, so any open entry
	// dialog's session summary (["work-entry-agent-entries", ws, entryId]) is stale.
	client.invalidateQueries({
		queryKey: ["work-entry-agent-entries", workspaceId],
	});
}

/**
 * Refreshes the mailbox after a change. Star/archive/trash move an item between
 * folders, so every folder list is invalidated (prefix match), along with the
 * sidebar counts, the header unread badge, and any open message detail (whose
 * toolbar reflects the same flags).
 */
export function invalidateMail(client: QueryClient): void {
	client.invalidateQueries({ queryKey: ["mail"] });
	client.invalidateQueries({ queryKey: ["mail-message"] });
	client.invalidateQueries({ queryKey: ["mail-counts"] });
	client.invalidateQueries({ queryKey: ["inbox-unread"] });
}

/**
 * Refreshes report listings after a create/delete: the paginated list and the
 * toolbar's full set (both under ["reports"]), plus the sidebar's in-use
 * template ids, which gate the archived-template tabs.
 */
export function invalidateReports(client: QueryClient): void {
	client.invalidateQueries({ queryKey: ["reports"] });
	client.invalidateQueries({ queryKey: ["report-template-ids"] });
}

/** Refreshes a content version's discussion (reactions + comments) after a
 * change. */
export function invalidateReportDiscussion(
	client: QueryClient,
	reportContentId: string,
): void {
	client.invalidateQueries({
		queryKey: ["report-discussion", reportContentId],
	});
}
