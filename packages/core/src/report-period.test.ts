import { expect, it } from "vitest";

import {
	deriveNextPeriod,
	formatPeriodLabel,
	periodUnitOf,
} from "./report-period";

// 2026-06-12 is a Friday; 16:30 UTC is already 2026-06-13 (Saturday) in JST.
const fridayUtc = new Date("2026-06-12T16:30:00Z");

it("maps date ranges to period units", () => {
	expect(periodUnitOf("today")).toBe("day");
	expect(periodUnitOf("yesterday")).toBe("day");
	expect(periodUnitOf("this_week")).toBe("week");
	expect(periodUnitOf("last_week")).toBe("week");
	expect(periodUnitOf("this_month")).toBe("month");
	expect(periodUnitOf("last_month")).toBe("month");
	expect(periodUnitOf({ from: "2026-06-01", to: "2026-06-15" })).toBe("custom");
});

it("derives daily periods from now, ignoring the previous snapshot", () => {
	const monday = { from: "2026-06-08", to: "2026-06-08" };
	expect(deriveNextPeriod("today", monday, "UTC", fridayUtc)).toEqual({
		from: "2026-06-12",
		to: "2026-06-12",
	});
	// The workspace timezone, not UTC, decides what "today" is.
	expect(deriveNextPeriod("today", monday, "Asia/Tokyo", fridayUtc)).toEqual({
		from: "2026-06-13",
		to: "2026-06-13",
	});
	// A "yesterday" series keeps targeting yesterday.
	expect(deriveNextPeriod("yesterday", monday, "UTC", fridayUtc)).toEqual({
		from: "2026-06-11",
		to: "2026-06-11",
	});
});

it("derives weekly periods from the previous snapshot", () => {
	expect(
		deriveNextPeriod(
			"this_week",
			{ from: "2026-06-01", to: "2026-06-07" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-06-08", to: "2026-06-14" });
	// Year rollover.
	expect(
		deriveNextPeriod(
			"last_week",
			{ from: "2026-12-28", to: "2027-01-03" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2027-01-04", to: "2027-01-10" });
});

it("derives monthly periods as the calendar month after the previous one", () => {
	// Jan 31 + 1 month must not overflow into March.
	expect(
		deriveNextPeriod(
			"this_month",
			{ from: "2026-01-01", to: "2026-01-31" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-02-01", to: "2026-02-28" });
	// Leap February.
	expect(
		deriveNextPeriod(
			"last_month",
			{ from: "2024-01-01", to: "2024-01-31" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2024-02-01", to: "2024-02-29" });
	// Year rollover.
	expect(
		deriveNextPeriod(
			"this_month",
			{ from: "2026-12-01", to: "2026-12-31" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2027-01-01", to: "2027-01-31" });
	// A non-aligned previous range (from an override) still yields the full
	// month after the month of its end date.
	expect(
		deriveNextPeriod(
			"this_month",
			{ from: "2026-05-16", to: "2026-06-15" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-07-01", to: "2026-07-31" });
});

it("derives custom periods as a same-length window after the previous one", () => {
	expect(
		deriveNextPeriod(
			{ from: "2026-01-28", to: "2026-02-03" },
			{ from: "2026-01-28", to: "2026-02-03" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-02-04", to: "2026-02-10" });
	// Single-day custom range.
	expect(
		deriveNextPeriod(
			{ from: "2026-06-30", to: "2026-06-30" },
			{ from: "2026-06-30", to: "2026-06-30" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-07-01", to: "2026-07-01" });
});

it("falls back to resolving the range when there is no previous snapshot", () => {
	expect(deriveNextPeriod("last_month", null, "UTC", fridayUtc)).toEqual({
		from: "2026-05-01",
		to: "2026-05-31",
	});
	expect(deriveNextPeriod("this_week", null, "UTC", fridayUtc)).toEqual({
		from: "2026-06-08",
		to: "2026-06-14",
	});
	const absolute = { from: "2026-04-01", to: "2026-04-10" };
	expect(deriveNextPeriod(absolute, null, "UTC", fridayUtc)).toEqual(absolute);
});

it("formats period labels compactly", () => {
	expect(formatPeriodLabel({ from: "2026-06-01", to: "2026-06-30" })).toBe(
		"2026-06",
	);
	expect(formatPeriodLabel({ from: "2024-02-01", to: "2024-02-29" })).toBe(
		"2024-02",
	);
	expect(formatPeriodLabel({ from: "2026-06-13", to: "2026-06-13" })).toBe(
		"2026-06-13",
	);
	// Almost-a-month ranges must stay explicit.
	expect(formatPeriodLabel({ from: "2026-06-01", to: "2026-06-29" })).toBe(
		"2026-06-01 – 2026-06-29",
	);
	expect(formatPeriodLabel({ from: "2026-06-01", to: "2026-06-07" })).toBe(
		"2026-06-01 – 2026-06-07",
	);
});
