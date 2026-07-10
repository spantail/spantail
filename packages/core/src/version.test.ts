import { describe, expect, it } from "vitest";

import { isNewerVersion } from "./version";

describe("isNewerVersion", () => {
	it("is true only when latest is a strictly newer clean vX.Y.Z", () => {
		expect(isNewerVersion("v0.2.0", "v0.1.0")).toBe(true);
		expect(isNewerVersion("v1.0.0", "v0.9.9")).toBe(true);
		expect(isNewerVersion("v0.1.1", "v0.1.0")).toBe(true);
		expect(isNewerVersion("v0.1.0", "v0.1.0")).toBe(false);
		expect(isNewerVersion("v0.1.0", "v0.2.0")).toBe(false);
	});

	it("compares each component numerically, not lexically", () => {
		expect(isNewerVersion("v0.10.0", "v0.9.0")).toBe(true);
		expect(isNewerVersion("v0.9.0", "v0.10.0")).toBe(false);
	});

	it("is false for off-tag or unparseable versions (clones/forks)", () => {
		expect(isNewerVersion("v0.2.0", "v0.1.0-7-gabc")).toBe(false);
		expect(isNewerVersion("v0.2.0", "unknown")).toBe(false);
		expect(isNewerVersion("v0.2.0", "1019df9")).toBe(false);
		expect(isNewerVersion("nightly", "v0.1.0")).toBe(false);
	});
});
