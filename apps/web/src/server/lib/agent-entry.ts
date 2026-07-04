import { todayInTimezone } from "@spantail/core";
import type { AgentEntryRow } from "@spantail/db";

/**
 * Projects an agent-entry row onto the public AgentEntry model: strips the
 * internal rollup bookkeeping (`rollupEventCount`, the stale-write guard's
 * measure) and adds `entryDate` — a read-time projection of `startedAt` into
 * the viewer's timezone (UTC on ingest echoes, where there is no human viewer;
 * readers recompute the day in their own timezone).
 */
export function serializeAgentEntry(row: AgentEntryRow, timezone: string) {
	const { rollupEventCount: _internal, ...entry } = row;
	return { ...entry, entryDate: todayInTimezone(timezone, row.startedAt) };
}
