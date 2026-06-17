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

/** Refreshes the inbox list and the header unread badge after a change. */
export function invalidateInbox(client: QueryClient): void {
	client.invalidateQueries({ queryKey: ["inbox"] });
	client.invalidateQueries({ queryKey: ["inbox-unread"] });
}

/** Refreshes a report's discussion (reactions + comments) after a change. */
export function invalidateReportDiscussion(
	client: QueryClient,
	reportId: string,
): void {
	client.invalidateQueries({ queryKey: ["report-discussion", reportId] });
}
