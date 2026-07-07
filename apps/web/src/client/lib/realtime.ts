import type { RealtimeEvent } from "@spantail/core";
import {
	type QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "./api";
import {
	invalidateMail,
	invalidateReportDiscussion,
	invalidateWorkEntryData,
} from "./query";

/** Maps a realtime invalidation signal onto the existing query invalidations. */
function applyRealtimeEvent(qc: QueryClient, ev: RealtimeEvent): void {
	switch (ev.type) {
		case "work-entry":
			if (ev.workspaceId) invalidateWorkEntryData(qc, ev.workspaceId);
			return;
		case "agent-entry":
			if (ev.workspaceId) {
				// The agent detail screen reads sessions under ["agent-entries", ws,
				// agentId, …] and stats under ["agent-entry-stats", ws, …]; the roster
				// (names) lives under ["workspace-agents", ws]. Invalidate all three by
				// prefix so a new session, its stats, and a newly-seen agent refresh.
				qc.invalidateQueries({ queryKey: ["agent-entries", ev.workspaceId] });
				qc.invalidateQueries({
					queryKey: ["agent-entry-stats", ev.workspaceId],
				});
				qc.invalidateQueries({
					queryKey: ["workspace-agents", ev.workspaceId],
				});
				// A deleted session drops its work-entry links, so refresh any open
				// entry dialog's session summary too (prefix covers all entry ids).
				qc.invalidateQueries({
					queryKey: ["work-entry-agent-entries", ev.workspaceId],
				});
			}
			return;
		case "project":
			if (ev.workspaceId) {
				qc.invalidateQueries({ queryKey: ["projects", ev.workspaceId] });
			}
			return;
		case "report-discussion":
			if (ev.id) invalidateReportDiscussion(qc, ev.id);
			return;
		case "message":
			// One mailbox feature: invalidateMail covers the unread badge, folder
			// counts, lists, and any open message detail.
			invalidateMail(qc);
			return;
	}
}

/**
 * Subscribes the authenticated user to their realtime SSE stream and applies each
 * invalidation signal to the query cache. One connection per user, independent of
 * the active workspace; the browser's EventSource reconnects on its own.
 * Connects only when the instance's realtime toggle is on — while off (the
 * default), no stream is opened and refetch-on-focus keeps screens current.
 */
export function useRealtimeSync(): void {
	const qc = useQueryClient();
	// Instance-wide and admin-controlled, so effectively static for a session:
	// no background refetching. A toggle flip reaches other browsers on their
	// next page load; in the admin's own browser the settings card invalidates
	// this key, which re-runs the effect below.
	const flag = useQuery({
		queryKey: ["realtime-enabled"],
		queryFn: () => api.getRealtimeEnabled(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const enabled = flag.data?.enabled === true;
	useEffect(() => {
		// Also covers the flag still loading: don't connect until it resolves true.
		if (!enabled) return;
		// Absent in non-browser environments (SSR, tests); skip rather than throw.
		if (typeof EventSource === "undefined") return;
		const source = new EventSource("/api/v1/realtime");
		// On a reconnect (not the first open), signals may have been missed while
		// the stream was down, so refetch active queries to catch up. EventSource
		// reconnects on its own; TanStack's refetch-on-focus default covers the
		// rarer case of a stream that can never connect at all.
		let reconnected = false;
		source.onopen = () => {
			if (reconnected) qc.invalidateQueries();
			reconnected = true;
		};
		source.onmessage = (e) => {
			try {
				applyRealtimeEvent(qc, JSON.parse(e.data) as RealtimeEvent);
			} catch {
				// Ignore malformed frames; keep-alive comments never reach onmessage.
			}
		};
		return () => source.close();
	}, [qc, enabled]);
}
