import type { WorkEntry } from "@spantail/core";
import { expect, it } from "vitest";

import { groupEntriesByDate } from "./entry-timeline";

function entry(
	id: string,
	entryDate: string,
	durationMinutes: number,
): WorkEntry {
	return {
		id,
		workspaceId: "ws1",
		projectId: "p1",
		userId: "u1",
		entryDate,
		durationMinutes,
		startedAt: null,
		endedAt: null,
		description: id,
		note: null,
		tags: [],
		source: "web",
		createdAt: "2026-06-12T00:00:00.000Z",
		updatedAt: "2026-06-12T00:00:00.000Z",
	};
}

it("groups entries by date with per-day totals", () => {
	const days = groupEntriesByDate([
		entry("a", "2026-06-12", 60),
		entry("b", "2026-06-12", 30),
		entry("c", "2026-06-11", 45),
	]);

	expect(days.map((d) => d.date)).toEqual(["2026-06-12", "2026-06-11"]);
	expect(days[0]?.totalMinutes).toBe(90);
	expect(days[0]?.entries.map((e) => e.id)).toEqual(["a", "b"]);
	expect(days[1]?.totalMinutes).toBe(45);
});

it("merges a date split across pages into one group", () => {
	// Page boundaries can split a day; flatten-then-group must rejoin it.
	const page1 = [entry("a", "2026-06-12", 10)];
	const page2 = [entry("b", "2026-06-12", 20), entry("c", "2026-06-10", 5)];
	const days = groupEntriesByDate([...page1, ...page2]);

	expect(days).toHaveLength(2);
	expect(days[0]?.entries).toHaveLength(2);
	expect(days[0]?.totalMinutes).toBe(30);
});

it("returns an empty list for no entries", () => {
	expect(groupEntriesByDate([])).toEqual([]);
});
