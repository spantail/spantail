import { todayInTimezone } from "@spantail/core";
import type { AgentEntryRow } from "@spantail/db";

/**
 * Projects an agent-entry row onto the public AgentEntry model: exposes the
 * rollup event count as `eventCount` (null on summary-path rows, which carry no
 * events) and adds `entryDate` — a read-time projection of `startedAt` into the
 * viewer's timezone (UTC on ingest echoes, where there is no human viewer;
 * readers recompute the day in their own timezone).
 */
export function serializeAgentEntry(row: AgentEntryRow, timezone: string) {
	const { rollupEventCount, ...entry } = row;
	return {
		...entry,
		eventCount: rollupEventCount,
		entryDate: todayInTimezone(timezone, row.startedAt),
	};
}
