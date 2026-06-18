import { expect, it } from "vitest";

import { nextNavIndex } from "./keyboard";

it("moves down and up within bounds", () => {
	expect(nextNavIndex(0, 3, 1)).toBe(1);
	expect(nextNavIndex(2, 3, -1)).toBe(1);
});

it("clamps at both ends", () => {
	expect(nextNavIndex(2, 3, 1)).toBe(2);
	expect(nextNavIndex(0, 3, -1)).toBe(0);
});

it("enters the list from no selection", () => {
	expect(nextNavIndex(-1, 3, 1)).toBe(0);
	expect(nextNavIndex(-1, 3, -1)).toBe(2);
});

it("returns -1 for an empty list", () => {
	expect(nextNavIndex(-1, 0, 1)).toBe(-1);
	expect(nextNavIndex(0, 0, -1)).toBe(-1);
});
