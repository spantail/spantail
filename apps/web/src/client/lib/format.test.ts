import { describe, expect, it } from "vitest";

import { formatCompactRange } from "./format";

describe("formatCompactRange", () => {
	it("collapses a same-month range to a single month label", () => {
		expect(formatCompactRange("2026-06-01", "2026-06-30", "en")).toBe(
			"Jun 1 – 30",
		);
	});

	it("keeps both months for a cross-month range", () => {
		expect(formatCompactRange("2026-05-28", "2026-06-13", "en")).toBe(
			"May 28 – Jun 13",
		);
	});

	it("keeps both months for a cross-year range", () => {
		expect(formatCompactRange("2025-12-29", "2026-01-04", "en")).toBe(
			"Dec 29 – Jan 4",
		);
	});

	it("renders a single day without a dash", () => {
		expect(formatCompactRange("2026-06-13", "2026-06-13", "en")).toBe("Jun 13");
	});

	it("localizes month and day for ja", () => {
		expect(formatCompactRange("2026-06-01", "2026-06-30", "ja")).toBe(
			"6月1日 – 30日",
		);
	});
});
