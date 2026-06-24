import { expect, it } from "vitest";

import { generatePat, hashPat, isPatFormat } from "./pat";

it("generates tokens in the documented format", () => {
	const token = generatePat();
	expect(isPatFormat(token)).toBe(true);
	expect(generatePat()).not.toBe(token);
});

it("rejects malformed tokens", () => {
	expect(isPatFormat("spantail_pat_short")).toBe(false);
	expect(
		isPatFormat("other_prefix_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
	).toBe(false);
	expect(isPatFormat("")).toBe(false);
});

it("hashes deterministically to sha-256 hex", async () => {
	// Known vector: sha256("abc")
	expect(await hashPat("abc")).toBe(
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	);
	expect(await hashPat("abc")).toBe(await hashPat("abc"));
});
