import { describe, expect, it } from "vitest";

import { formatDateRange } from "./format";

// formatDateRange is re-exported from @spantail/core (full coverage lives in
// packages/core/src/datetime-format.test.ts); this asserts the client import.
describe("formatDateRange", () => {
	it("collapses a same-month range to a single month label", () => {
		expect(formatDateRange("2026-06-01", "2026-06-30", "en")).toBe(
			"Jun 1 – 30",
		);
	});

	it("localizes month and day for ja", () => {
		expect(formatDateRange("2026-06-01", "2026-06-30", "ja")).toBe(
			"6月1日 – 30日",
		);
	});
});
