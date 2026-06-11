import { expect, it } from "vitest";

import { formatDuration } from "./duration";

it("formats durations", () => {
	expect(formatDuration(45)).toBe("45m");
	expect(formatDuration(60)).toBe("1h");
	expect(formatDuration(90)).toBe("1h 30m");
	expect(formatDuration(125)).toBe("2h 05m");
	expect(formatDuration(0)).toBe("0m");
});
