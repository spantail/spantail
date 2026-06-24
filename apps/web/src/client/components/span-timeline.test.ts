import type { WorkSpan } from "@spantail/core";
import { expect, it } from "vitest";

import { groupSpansByDate } from "./span-timeline";

function span(id: string, spanDate: string, durationMinutes: number): WorkSpan {
	return {
		id,
		workspaceId: "ws1",
		projectId: "p1",
		userId: "u1",
		spanDate,
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

it("groups spans by date with per-day totals", () => {
	const days = groupSpansByDate([
		span("a", "2026-06-12", 60),
		span("b", "2026-06-12", 30),
		span("c", "2026-06-11", 45),
	]);

	expect(days.map((d) => d.date)).toEqual(["2026-06-12", "2026-06-11"]);
	expect(days[0]?.totalMinutes).toBe(90);
	expect(days[0]?.spans.map((e) => e.id)).toEqual(["a", "b"]);
	expect(days[1]?.totalMinutes).toBe(45);
});

it("merges a date split across pages into one group", () => {
	// Page boundaries can split a day; flatten-then-group must rejoin it.
	const page1 = [span("a", "2026-06-12", 10)];
	const page2 = [span("b", "2026-06-12", 20), span("c", "2026-06-10", 5)];
	const days = groupSpansByDate([...page1, ...page2]);

	expect(days).toHaveLength(2);
	expect(days[0]?.spans).toHaveLength(2);
	expect(days[0]?.totalMinutes).toBe(30);
});

it("returns an empty list for no spans", () => {
	expect(groupSpansByDate([])).toEqual([]);
});
