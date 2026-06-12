import { expect, it } from "vitest";

import { formatDuration, parseDuration } from "./duration";

it("parses bare minutes", () => {
	expect(parseDuration("90")).toBe(90);
	expect(parseDuration(" 15 ")).toBe(15);
});

it("parses h/m forms", () => {
	expect(parseDuration("45m")).toBe(45);
	expect(parseDuration("2h")).toBe(120);
	expect(parseDuration("1h30m")).toBe(90);
	expect(parseDuration("1h 30m")).toBe(90);
	expect(parseDuration("1H 30M")).toBe(90);
	expect(parseDuration("0h30m")).toBe(30);
	expect(parseDuration("2h90m")).toBe(210);
});

it("rejects invalid or non-positive durations", () => {
	expect(parseDuration("")).toBeNull();
	expect(parseDuration("0")).toBeNull();
	expect(parseDuration("0m")).toBeNull();
	expect(parseDuration("-5")).toBeNull();
	expect(parseDuration("1.5h")).toBeNull();
	expect(parseDuration("h")).toBeNull();
	expect(parseDuration("m")).toBeNull();
	expect(parseDuration("30m1h")).toBeNull();
	expect(parseDuration("1h30")).toBeNull();
	expect(parseDuration("two hours")).toBeNull();
	expect(parseDuration("999999999999999999h")).toBeNull();
});

it("formats durations", () => {
	expect(formatDuration(45)).toBe("45m");
	expect(formatDuration(60)).toBe("1h");
	expect(formatDuration(90)).toBe("1h 30m");
	expect(formatDuration(125)).toBe("2h 05m");
	expect(formatDuration(0)).toBe("0m");
});
