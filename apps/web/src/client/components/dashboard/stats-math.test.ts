import { expect, it } from "vitest";

import {
	buildDailyWindow,
	type DateBucket,
	daysInclusive,
	isWeekend,
	pctDelta,
	sumWindow,
} from "./stats-math";

it("flags Saturdays and Sundays as weekends", () => {
	expect(isWeekend("2026-06-13")).toBe(true); // Saturday
	expect(isWeekend("2026-06-14")).toBe(true); // Sunday
	expect(isWeekend("2026-06-15")).toBe(false); // Monday
	expect(isWeekend("2026-06-12")).toBe(false); // Friday
});

it("counts inclusive days between dates", () => {
	expect(daysInclusive("2026-06-13", "2026-06-13")).toBe(1);
	expect(daysInclusive("2026-06-01", "2026-06-13")).toBe(13);
	expect(daysInclusive("2026-02-28", "2026-03-01")).toBe(2);
});

it("sums an inclusive date window", () => {
	const rows: DateBucket[] = [
		{ date: "2026-06-10", minutes: 60, count: 1 },
		{ date: "2026-06-11", minutes: 30, count: 2 },
		{ date: "2026-06-12", minutes: 90, count: 1 },
	];
	expect(sumWindow(rows, "2026-06-11", "2026-06-12")).toEqual({
		minutes: 120,
		count: 3,
	});
	expect(sumWindow(rows, "2026-06-13", "2026-06-20")).toEqual({
		minutes: 0,
		count: 0,
	});
});

it("computes a rounded percentage delta", () => {
	expect(pctDelta(120, 100)).toBe(20);
	expect(pctDelta(80, 100)).toBe(-20);
	expect(pctDelta(133, 100)).toBe(33);
});

it("returns null delta when the previous period had no activity", () => {
	// Avoids a misleading "+100%" against a zero base.
	expect(pctDelta(50, 0)).toBeNull();
	expect(pctDelta(0, 0)).toBeNull();
});

it("zero-fills a contiguous daily window", () => {
	const byDate = new Map<string, DateBucket>([
		["2026-06-11", { date: "2026-06-11", minutes: 45, count: 1 }],
		["2026-06-13", { date: "2026-06-13", minutes: 90, count: 2 }],
	]);
	const window = buildDailyWindow(byDate, "2026-06-11", 3);

	expect(window.map((d) => d.date)).toEqual([
		"2026-06-11",
		"2026-06-12",
		"2026-06-13",
	]);
	expect(window.map((d) => d.minutes)).toEqual([45, 0, 90]);
	expect(window[1]).toMatchObject({ minutes: 0, count: 0 });
	expect(window[2]?.isWeekend).toBe(true); // 2026-06-13 is a Saturday
});
