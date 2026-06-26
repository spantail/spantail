import { expect, it } from "vitest";

import { formatPeriodLabel } from "./report-period";

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
