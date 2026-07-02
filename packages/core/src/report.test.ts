import { expect, it } from "vitest";

import {
	absoluteDateRangeSchema,
	filterEntriesByTags,
	MAX_REPORT_SPAN_DAYS,
	reportFiltersInputSchema,
	reportFiltersSchema,
	resolveDateRange,
} from "./report";

// 2026-06-07 is a Sunday; 16:30 UTC is already 2026-06-08 (Monday) in JST.
const sundayUtcMondayJst = new Date("2026-06-07T16:30:00Z");

it("resolves today and yesterday in the given timezone", () => {
	expect(resolveDateRange("today", "UTC", sundayUtcMondayJst)).toEqual({
		from: "2026-06-07",
		to: "2026-06-07",
	});
	expect(resolveDateRange("today", "Asia/Tokyo", sundayUtcMondayJst)).toEqual({
		from: "2026-06-08",
		to: "2026-06-08",
	});
	expect(
		resolveDateRange("yesterday", "Asia/Tokyo", sundayUtcMondayJst),
	).toEqual({ from: "2026-06-07", to: "2026-06-07" });
});

it("resolves weeks starting on Monday", () => {
	// Sunday in UTC belongs to the week starting the previous Monday.
	expect(resolveDateRange("this_week", "UTC", sundayUtcMondayJst)).toEqual({
		from: "2026-06-01",
		to: "2026-06-07",
	});
	// Monday in JST starts a new week.
	expect(
		resolveDateRange("this_week", "Asia/Tokyo", sundayUtcMondayJst),
	).toEqual({ from: "2026-06-08", to: "2026-06-14" });
	expect(resolveDateRange("last_week", "UTC", sundayUtcMondayJst)).toEqual({
		from: "2026-05-25",
		to: "2026-05-31",
	});
});

it("resolves months including the january boundary", () => {
	expect(resolveDateRange("this_month", "UTC", sundayUtcMondayJst)).toEqual({
		from: "2026-06-01",
		to: "2026-06-30",
	});
	expect(resolveDateRange("last_month", "UTC", sundayUtcMondayJst)).toEqual({
		from: "2026-05-01",
		to: "2026-05-31",
	});
	const january = new Date("2026-01-15T00:00:00Z");
	expect(resolveDateRange("last_month", "UTC", january)).toEqual({
		from: "2025-12-01",
		to: "2025-12-31",
	});
});

it("passes absolute ranges through unchanged", () => {
	const range = { from: "2026-01-01", to: "2026-01-31" };
	expect(resolveDateRange(range, "Asia/Tokyo")).toEqual(range);
});

it("rejects an absolute range with from after to", () => {
	expect(
		absoluteDateRangeSchema.safeParse({ from: "2026-02-01", to: "2026-01-31" })
			.success,
	).toBe(false);
});

it("accepts an empty workspace set as instance scope in stored filters", () => {
	// Instance scope is owner-scoped and stores the empty set (the resolved
	// membership set is a render-time query detail, never persisted).
	const instance = reportFiltersSchema.parse({
		workspaceIds: [],
		dateRange: { from: "2026-06-01", to: "2026-06-07" },
	});
	expect(instance.workspaceIds).toEqual([]);
	const parsed = reportFiltersSchema.parse({
		workspaceIds: ["ws1"],
		dateRange: { from: "2026-06-01", to: "2026-06-07" },
	});
	expect(parsed.tags).toBeUndefined();
});

it("stores absolute date ranges only, but accepts presets on the wire", () => {
	// Stored filters reject a preset; the wire input accepts it.
	expect(
		reportFiltersSchema.safeParse({
			workspaceIds: ["ws1"],
			dateRange: "this_month",
		}).success,
	).toBe(false);
	expect(
		reportFiltersInputSchema.safeParse({
			workspaceIds: ["ws1"],
			dateRange: "this_month",
		}).success,
	).toBe(true);
});

it("caps an absolute range at the maximum span", () => {
	expect(MAX_REPORT_SPAN_DAYS).toBe(366);
	// 2026-01-01 .. 2026-12-31 is 365 days (inclusive 365 < 366) — allowed.
	expect(
		absoluteDateRangeSchema.safeParse({
			from: "2026-01-01",
			to: "2026-12-31",
		}).success,
	).toBe(true);
	// A range longer than a leap year is rejected.
	expect(
		absoluteDateRangeSchema.safeParse({
			from: "2024-01-01",
			to: "2025-01-02",
		}).success,
	).toBe(false);
});

it("filters entries by any matching tag", () => {
	const entries = [
		{ id: "a", tags: ["api", "review"] },
		{ id: "b", tags: ["chore"] },
		{ id: "c", tags: [] },
	];
	expect(filterEntriesByTags(entries)).toHaveLength(3);
	expect(filterEntriesByTags(entries, [])).toHaveLength(3);
	expect(
		filterEntriesByTags(entries, ["api", "docs"]).map((e) => e.id),
	).toEqual(["a"]);
});
