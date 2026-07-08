import { describe, expect, it } from "vitest";

import { isVersionMismatch } from "./server-version";

describe("isVersionMismatch", () => {
	it("is true when both versions are comparable and differ", () => {
		expect(isVersionMismatch("v0.2.0", "v0.1.0")).toBe(true);
		expect(isVersionMismatch("v0.1.0-2-gabc", "v0.1.0")).toBe(true);
	});

	it("is false when the versions match", () => {
		expect(isVersionMismatch("v0.1.0", "v0.1.0")).toBe(false);
	});

	it("is false until a server version has been seen", () => {
		expect(isVersionMismatch(null, "v0.1.0")).toBe(false);
	});

	it("is false when either side is not comparable (dev / no git history)", () => {
		expect(isVersionMismatch("unknown", "v0.1.0")).toBe(false);
		expect(isVersionMismatch("v0.2.0", "unknown")).toBe(false);
		expect(isVersionMismatch("", "v0.1.0")).toBe(false);
	});
});
