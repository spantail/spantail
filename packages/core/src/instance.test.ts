import { describe, expect, it } from "vitest";

import { isEmailDomainAllowed, normalizeAllowedDomains } from "./instance";

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

describe("isEmailDomainAllowed", () => {
	it("allows any email when the list is empty", () => {
		expect(isEmailDomainAllowed("anyone@whatever.io", [])).toBe(true);
	});

	it("allows an exact domain match, case-insensitively", () => {
		expect(isEmailDomainAllowed("Jane@Example.com", ["example.com"])).toBe(
			true,
		);
		expect(isEmailDomainAllowed("jane@example.com", ["@Example.com"])).toBe(
			true,
		);
	});

	it("rejects a domain that is not in the list", () => {
		expect(isEmailDomainAllowed("eve@evil.com", ["example.com"])).toBe(false);
	});

	it("does not implicitly allow subdomains", () => {
		expect(isEmailDomainAllowed("user@sub.example.com", ["example.com"])).toBe(
			false,
		);
	});

	it("rejects malformed input with no domain part", () => {
		expect(isEmailDomainAllowed("not-an-email", ["example.com"])).toBe(false);
	});
});
