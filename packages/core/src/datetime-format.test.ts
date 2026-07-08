import { describe, expect, it } from "vitest";

import {
	formatDateRange,
	formatDay,
	formatInstantDate,
	formatTimestamp,
} from "./datetime-format";

const NOW = "2026-07-08"; // viewer's today, for year: "auto"

describe("formatDay", () => {
	it("shows a weekday and omits the year for the current year (auto)", () => {
		expect(formatDay("2026-06-01", "en", { now: NOW })).toBe("Mon, Jun 1");
		expect(formatDay("2026-06-01", "ja", { now: NOW })).toBe("6月1日(月)");
	});

	it("shows the year for a past year (auto)", () => {
		expect(formatDay("2024-06-01", "en", { now: NOW })).toBe(
			"Sat, Jun 1, 2024",
		);
		expect(formatDay("2024-06-01", "ja", { now: NOW })).toBe(
			"2024年6月1日(土)",
		);
	});

	it("omits the year when no reference is given", () => {
		expect(formatDay("2024-06-01", "en")).toBe("Sat, Jun 1");
	});

	it("forces the year with year: always", () => {
		expect(formatDay("2026-06-01", "en", { now: NOW, year: "always" })).toBe(
			"Mon, Jun 1, 2026",
		);
	});

	it("supports a long weekday and month for headers", () => {
		expect(
			formatDay("2026-06-01", "en", {
				now: NOW,
				weekday: "long",
				month: "long",
			}),
		).toBe("Monday, June 1");
		expect(
			formatDay("2026-06-01", "ja", {
				now: NOW,
				weekday: "long",
				month: "long",
			}),
		).toBe("6月1日月曜日");
	});

	it("drops the weekday with weekday: none", () => {
		expect(formatDay("2026-06-01", "en", { now: NOW, weekday: "none" })).toBe(
			"Jun 1",
		);
	});
});

describe("formatDateRange", () => {
	it("collapses a same-month range to a single month label", () => {
		expect(formatDateRange("2026-06-01", "2026-06-30", "en")).toBe(
			"Jun 1 – 30",
		);
	});

	it("keeps both months for a cross-month range", () => {
		expect(formatDateRange("2026-05-28", "2026-06-13", "en")).toBe(
			"May 28 – Jun 13",
		);
	});

	it("renders a single day without a dash", () => {
		expect(formatDateRange("2026-06-13", "2026-06-13", "en")).toBe("Jun 13");
	});

	it("localizes month and day for ja", () => {
		expect(formatDateRange("2026-06-01", "2026-06-30", "ja")).toBe(
			"6月1日 – 30日",
		);
	});

	it("omits the year for the current year (auto)", () => {
		expect(
			formatDateRange("2026-06-01", "2026-06-30", "en", { now: NOW }),
		).toBe("Jun 1 – 30");
	});

	it("qualifies both endpoints when a past year is in range (auto)", () => {
		expect(
			formatDateRange("2024-06-01", "2024-06-30", "en", { now: NOW }),
		).toBe("Jun 1, 2024 – Jun 30, 2024");
		expect(
			formatDateRange("2024-06-01", "2024-06-30", "ja", { now: NOW }),
		).toBe("2024年6月1日 – 2024年6月30日");
	});
});

describe("formatTimestamp", () => {
	it("renders date + 24h clock in the timezone, no weekday", () => {
		// 2026-05-31T23:05Z is 2026-06-01 08:05 in Asia/Tokyo.
		expect(
			formatTimestamp("2026-05-31T23:05:00Z", "en", "Asia/Tokyo", { now: NOW }),
		).toBe("Jun 1, 08:05");
		expect(
			formatTimestamp("2026-05-31T23:05:00Z", "ja", "Asia/Tokyo", { now: NOW }),
		).toBe("6月1日 08:05");
	});

	it("shows the year for a past year (auto)", () => {
		expect(
			formatTimestamp("2024-05-31T23:05:00Z", "en", "Asia/Tokyo", { now: NOW }),
		).toBe("Jun 1, 2024, 08:05");
	});
});

describe("formatInstantDate", () => {
	it("renders the instant's date in the timezone, no weekday or clock", () => {
		expect(
			formatInstantDate("2026-05-31T23:05:00Z", "en", "Asia/Tokyo", {
				now: NOW,
			}),
		).toBe("Jun 1");
		expect(
			formatInstantDate("2026-05-31T23:05:00Z", "ja", "Asia/Tokyo", {
				now: NOW,
			}),
		).toBe("6月1日");
	});

	it("shows the year for a past year (auto)", () => {
		expect(
			formatInstantDate("2024-05-31T23:05:00Z", "en", "Asia/Tokyo", {
				now: NOW,
			}),
		).toBe("Jun 1, 2024");
	});
});
