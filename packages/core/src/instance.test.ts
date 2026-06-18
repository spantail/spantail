import { describe, expect, it } from "vitest";

import { isSelfJoinDomain, normalizeAllowedDomains } from "./instance";

describe("normalizeAllowedDomains", () => {
	it("lowercases, trims, strips a leading @, and drops blanks", () => {
		expect(
			normalizeAllowedDomains(["  Example.com ", "@Foo.ORG", "", "   "]),
		).toEqual(["example.com", "foo.org"]);
	});

	it("de-duplicates while preserving order", () => {
		expect(
			normalizeAllowedDomains(["a.com", "B.com", "a.com", "@b.com"]),
		).toEqual(["a.com", "b.com"]);
	});
});

describe("isSelfJoinDomain", () => {
	it("denies self-join for every email when the list is empty", () => {
		expect(isSelfJoinDomain("anyone@whatever.io", [])).toBe(false);
	});

	it("allows an exact domain match, case-insensitively", () => {
		expect(isSelfJoinDomain("Jane@Example.com", ["example.com"])).toBe(true);
		expect(isSelfJoinDomain("jane@example.com", ["@Example.com"])).toBe(true);
	});

	it("rejects a domain that is not in the list", () => {
		expect(isSelfJoinDomain("eve@evil.com", ["example.com"])).toBe(false);
	});

	it("does not implicitly allow subdomains", () => {
		expect(isSelfJoinDomain("user@sub.example.com", ["example.com"])).toBe(
			false,
		);
	});

	it("rejects malformed input with no domain part", () => {
		expect(isSelfJoinDomain("not-an-email", ["example.com"])).toBe(false);
	});
});
