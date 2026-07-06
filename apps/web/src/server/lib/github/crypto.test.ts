import { expect, it } from "vitest";
import { TEST_PKCS1_PEM } from "../../../../test/github-fixtures";
import { createAppJwt } from "./app-auth";
import { decryptSecret, encryptSecret, signState, verifyState } from "./crypto";
import { privateKeyPemToPkcs8Der } from "./pkcs8";
import { verifyWebhookSignature } from "./webhook";

const SECRET = "test-better-auth-secret";

it("round-trips secrets through AES-GCM", async () => {
	const stored = await encryptSecret(SECRET, "hello webhook secret");
	expect(stored).not.toContain("hello");
	expect(await decryptSecret(SECRET, stored)).toBe("hello webhook secret");
});

it("produces a distinct ciphertext per encryption (random IV)", async () => {
	const a = await encryptSecret(SECRET, "same value");
	const b = await encryptSecret(SECRET, "same value");
	expect(a).not.toBe(b);
});

it("fails to decrypt tampered or wrong-key ciphertexts", async () => {
	const stored = await encryptSecret(SECRET, "value");
	await expect(decryptSecret("other-secret", stored)).rejects.toThrow();
	const tampered = `${stored.slice(0, -4)}AAA=`;
	await expect(decryptSecret(SECRET, tampered)).rejects.toThrow();
});

it("signs and verifies state tokens by purpose and expiry", async () => {
	const token = await signState(SECRET, "manifest", 60_000);
	expect(await verifyState(SECRET, token, "manifest")).toBe(true);
	expect(await verifyState(SECRET, token, "connect")).toBe(false);
	expect(await verifyState("other-secret", token, "manifest")).toBe(false);
	expect(await verifyState(SECRET, "garbage", "manifest")).toBe(false);
	const expired = await signState(SECRET, "manifest", -1);
	expect(await verifyState(SECRET, expired, "manifest")).toBe(false);
});

it("converts a PKCS#1 PEM into an importable PKCS#8 key that signs RS256", async () => {
	const der = privateKeyPemToPkcs8Der(TEST_PKCS1_PEM);
	expect(der).not.toBeNull();
	if (!der) return;
	const jwt = await createAppJwt(12345, der);
	const [header, payload, signature] = jwt.split(".");
	expect(header).toBeTruthy();
	expect(signature).toBeTruthy();
	const decoded = JSON.parse(
		atob((payload ?? "").replaceAll("-", "+").replaceAll("_", "/")),
	);
	expect(decoded.iss).toBe("12345");
	expect(decoded.exp - decoded.iat).toBe(600); // 60s backdate + 540s ttl
});

it("passes PKCS#8 PEMs through and rejects garbage", () => {
	expect(privateKeyPemToPkcs8Der("not a pem")).toBeNull();
	// A PKCS#8 wrapper is accepted as-is (bytes only re-encoded).
	const der = privateKeyPemToPkcs8Der(TEST_PKCS1_PEM);
	expect(der?.[0]).toBe(0x30); // DER SEQUENCE
});

it("verifies webhook HMAC signatures and rejects everything else", async () => {
	const body = new TextEncoder().encode('{"action":"created"}');
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode("hook-secret"),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = new Uint8Array(
		await crypto.subtle.sign("HMAC", key, body as BufferSource),
	);
	const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");

	const buffer = body.buffer as ArrayBuffer;
	expect(
		await verifyWebhookSignature("hook-secret", buffer, `sha256=${hex}`),
	).toBe(true);
	expect(
		await verifyWebhookSignature("other-secret", buffer, `sha256=${hex}`),
	).toBe(false);
	expect(await verifyWebhookSignature("hook-secret", buffer, undefined)).toBe(
		false,
	);
	expect(
		await verifyWebhookSignature("hook-secret", buffer, "sha256=zznothex"),
	).toBe(false);
	expect(
		await verifyWebhookSignature("hook-secret", buffer, `sha1=${hex}`),
	).toBe(false);
});
