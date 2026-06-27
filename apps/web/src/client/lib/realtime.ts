import type { RealtimeEvent } from "@spantail/core";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

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
				qc.invalidateQueries({
					queryKey: ["workspace-agents", ev.workspaceId],
				});
				// Agent activity also feeds the entry timelines and stats.
				invalidateWorkEntryData(qc, ev.workspaceId);
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
 */
export function useRealtimeSync(): void {
	const qc = useQueryClient();
	useEffect(() => {
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
	}, [qc]);
}
