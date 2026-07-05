import { expect, it } from "vitest";

import { type AttributableSpan, dominantEntryDate } from "./day-attribution";

function span(
	startedAt: string,
	endedAt: string | null,
	durationMinutes: number,
): AttributableSpan {
	return { startedAt, endedAt, durationMinutes };
}

it("returns null for an empty input", () => {
	expect(dominantEntryDate([], "Asia/Tokyo")).toBeNull();
});

it("attributes a single-day span to its day", () => {
	// 10:00–12:00 JST on Jul 1.
	const spans = [
		span("2026-07-01T01:00:00.000Z", "2026-07-01T03:00:00.000Z", 120),
	];
	expect(dominantEntryDate(spans, "Asia/Tokyo")).toBe("2026-07-01");
});

it("picks the pre-midnight day when it carries the larger share", () => {
	// 21:00 JST Jul 1 – 01:00 JST Jul 2: 3h before midnight, 1h after.
	const spans = [
		span("2026-07-01T12:00:00.000Z", "2026-07-01T16:00:00.000Z", 60),
	];
	expect(dominantEntryDate(spans, "Asia/Tokyo")).toBe("2026-07-01");
});

it("picks the post-midnight day when it carries the larger share", () => {
	// 23:00 JST Jul 1 – 03:00 JST Jul 2: 1h before midnight, 3h after.
	const spans = [
		span("2026-07-01T14:00:00.000Z", "2026-07-01T18:00:00.000Z", 60),
	];
	expect(dominantEntryDate(spans, "Asia/Tokyo")).toBe("2026-07-02");
});

it("resolves an exact tie to the most recent day", () => {
	// 23:00 JST Jul 1 – 01:00 JST Jul 2: exactly one hour on each side.
	const spans = [
		span("2026-07-01T14:00:00.000Z", "2026-07-01T16:00:00.000Z", 60),
	];
	expect(dominantEntryDate(spans, "Asia/Tokyo")).toBe("2026-07-02");
});

it("picks the full middle day of a multi-day span", () => {
	// 21:00 JST Jul 1 – 09:00 JST Jul 3: 3h + 24h + 9h.
	const spans = [
		span("2026-07-01T12:00:00.000Z", "2026-07-03T00:00:00.000Z", 360),
	];
	expect(dominantEntryDate(spans, "Asia/Tokyo")).toBe("2026-07-02");
});

it("attributes a span without an end to its start day", () => {
	// 09:00 JST Jul 1, 10 hours of active time, no recorded end.
	const spans = [span("2026-07-01T00:00:00.000Z", null, 600)];
	expect(dominantEntryDate(spans, "Asia/Tokyo")).toBe("2026-07-01");
});

it("treats an end before the start as no end", () => {
	const spans = [
		span("2026-07-02T00:00:00.000Z", "2026-07-01T00:00:00.000Z", 60),
	];
	expect(dominantEntryDate(spans, "Asia/Tokyo")).toBe("2026-07-02");
});

it("nominates start days of zero-duration spans, most recent first", () => {
	const spans = [
		span("2026-07-01T01:00:00.000Z", null, 0),
		span("2026-07-03T01:00:00.000Z", null, 0),
	];
	expect(dominantEntryDate(spans, "Asia/Tokyo")).toBe("2026-07-03");
});

it("aggregates weights across spans before picking the day", () => {
	// Alone, the overnight span favors Jul 2 (60 vs 180); the Jul 1 span's 200
	// minutes flip the aggregate to Jul 1 (260 vs 180).
	const overnight = span(
		"2026-07-01T14:00:00.000Z",
		"2026-07-01T18:00:00.000Z",
		240,
	);
	const daytime = span(
		"2026-07-01T01:00:00.000Z",
		"2026-07-01T03:00:00.000Z",
		200,
	);
	expect(dominantEntryDate([overnight], "Asia/Tokyo")).toBe("2026-07-02");
	expect(dominantEntryDate([overnight, daytime], "Asia/Tokyo")).toBe(
		"2026-07-01",
	);
});

it("depends on the viewer timezone", () => {
	// 16:00–17:00 UTC is still Jul 1 in UTC but already Jul 2 in Tokyo.
	const spans = [
		span("2026-07-01T16:00:00.000Z", "2026-07-01T17:00:00.000Z", 60),
	];
	expect(dominantEntryDate(spans, "UTC")).toBe("2026-07-01");
	expect(dominantEntryDate(spans, "Asia/Tokyo")).toBe("2026-07-02");
});

it("weights days by real hours across a spring-forward transition", () => {
	// America/New_York, Mar 8–10 2025: local Mar 8 is 24h, Mar 9 only 23h
	// (02:00 skips to 03:00), so a span covering both full days lands on Mar 8.
	const spans = [
		span("2025-03-08T05:00:00.000Z", "2025-03-10T04:00:00.000Z", 470),
	];
	expect(dominantEntryDate(spans, "America/New_York")).toBe("2025-03-08");
});

it("weights days by real hours across a fall-back transition", () => {
	// America/New_York, Nov 1–3 2025: local Nov 1 is 24h, Nov 2 is 25h
	// (01:00 repeats), so a span covering both full days lands on Nov 2.
	const spans = [
		span("2025-11-01T04:00:00.000Z", "2025-11-03T05:00:00.000Z", 490),
	];
	expect(dominantEntryDate(spans, "America/New_York")).toBe("2025-11-02");
});

it("ignores spans with unparseable timestamps", () => {
	const spans = [
		span("not-a-date", null, 600),
		span("2026-07-01T01:00:00.000Z", "2026-07-01T02:00:00.000Z", 60),
	];
	expect(dominantEntryDate(spans, "UTC")).toBe("2026-07-01");
});
