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
 * timelines, project lists, and stats (prefix-matched query keys).
 */
export function invalidateWorkEntryData(
	client: QueryClient,
	workspaceId: string,
): void {
	client.invalidateQueries({ queryKey: ["work-entries", workspaceId] });
	client.invalidateQueries({ queryKey: ["work-entry-stats", workspaceId] });
}
