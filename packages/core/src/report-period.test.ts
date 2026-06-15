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

it("derives daily periods from now, ignoring the previous period", () => {
	const monday = { from: "2026-06-08", to: "2026-06-08" };
	expect(deriveNextPeriod("day", monday, "UTC", fridayUtc)).toEqual({
		from: "2026-06-12",
		to: "2026-06-12",
	});
	// The workspace timezone, not UTC, decides what "today" is.
	expect(deriveNextPeriod("day", monday, "Asia/Tokyo", fridayUtc)).toEqual({
		from: "2026-06-13",
		to: "2026-06-13",
	});
});

it("derives weekly periods from the previous period", () => {
	expect(
		deriveNextPeriod(
			"week",
			{ from: "2026-06-01", to: "2026-06-07" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-06-08", to: "2026-06-14" });
	// Year rollover.
	expect(
		deriveNextPeriod(
			"week",
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
			"month",
			{ from: "2026-01-01", to: "2026-01-31" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-02-01", to: "2026-02-28" });
	// Leap February.
	expect(
		deriveNextPeriod(
			"month",
			{ from: "2024-01-01", to: "2024-01-31" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2024-02-01", to: "2024-02-29" });
	// Year rollover.
	expect(
		deriveNextPeriod(
			"month",
			{ from: "2026-12-01", to: "2026-12-31" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2027-01-01", to: "2027-01-31" });
	// A non-aligned previous range still yields the full month after its end.
	expect(
		deriveNextPeriod(
			"month",
			{ from: "2026-05-16", to: "2026-06-15" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-07-01", to: "2026-07-31" });
});

it("derives custom periods as a same-length window after the previous one", () => {
	expect(
		deriveNextPeriod(
			"custom",
			{ from: "2026-01-28", to: "2026-02-03" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-02-04", to: "2026-02-10" });
	// Single-day custom range.
	expect(
		deriveNextPeriod(
			"custom",
			{ from: "2026-06-30", to: "2026-06-30" },
			"UTC",
			fridayUtc,
		),
	).toEqual({ from: "2026-07-01", to: "2026-07-01" });
});

it("falls back to the current period for the cadence when there is no previous", () => {
	expect(deriveNextPeriod("month", null, "UTC", fridayUtc)).toEqual({
		from: "2026-06-01",
		to: "2026-06-30",
	});
	expect(deriveNextPeriod("week", null, "UTC", fridayUtc)).toEqual({
		from: "2026-06-08",
		to: "2026-06-14",
	});
	expect(deriveNextPeriod("day", null, "UTC", fridayUtc)).toEqual({
		from: "2026-06-12",
		to: "2026-06-12",
	});
	expect(deriveNextPeriod("custom", null, "UTC", fridayUtc)).toEqual({
		from: "2026-06-12",
		to: "2026-06-12",
	});
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
