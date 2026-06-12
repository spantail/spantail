import { expect, it } from "vitest";

import { generatePat } from "./pat";
import {
	generateShareToken,
	hashSharePasscode,
	isShareTokenFormat,
	shareStatus,
	verifySharePasscode,
} from "./share";

it("generates unique tokens in the documented format", () => {
	const tokens = new Set(
		Array.from({ length: 100 }, () => generateShareToken()),
	);
	expect(tokens.size).toBe(100);
	for (const token of tokens) expect(isShareTokenFormat(token)).toBe(true);
});

it("rejects malformed tokens", () => {
	expect(isShareTokenFormat("")).toBe(false);
	expect(isShareTokenFormat("a".repeat(21))).toBe(false);
	expect(isShareTokenFormat("a".repeat(23))).toBe(false);
	expect(isShareTokenFormat(`${"a".repeat(20)}+=`)).toBe(false);
	expect(isShareTokenFormat(generatePat())).toBe(false);
});

it("verifies passcodes against salted hashes", async () => {
	const hash = await hashSharePasscode("open sesame");
	expect(await verifySharePasscode("open sesame", hash)).toBe(true);
	expect(await verifySharePasscode("wrong", hash)).toBe(false);

	// A fresh salt produces a different hash that still verifies.
	const again = await hashSharePasscode("open sesame");
	expect(again).not.toBe(hash);
	expect(await verifySharePasscode("open sesame", again)).toBe(true);
});

it("treats malformed stored hashes as a mismatch", async () => {
	expect(await verifySharePasscode("x", "")).toBe(false);
	expect(await verifySharePasscode("x", "v1:only")).toBe(false);
	expect(await verifySharePasscode("x", "v2:aaaa:bbbb")).toBe(false);
	expect(await verifySharePasscode("x", "v1:!!:bbbb")).toBe(false);
});

it("derives the share status with revocation winning over expiry", () => {
	const now = new Date("2026-06-12T00:00:00Z");
	const past = "2026-06-11T00:00:00.000Z";
	const future = "2026-06-13T00:00:00.000Z";
	expect(shareStatus({ revokedAt: null, expiresAt: null }, now)).toBe("active");
	expect(shareStatus({ revokedAt: null, expiresAt: future }, now)).toBe(
		"active",
	);
	expect(shareStatus({ revokedAt: null, expiresAt: past }, now)).toBe(
		"expired",
	);
	expect(shareStatus({ revokedAt: past, expiresAt: past }, now)).toBe(
		"revoked",
	);
});
