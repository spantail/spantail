import { expect, it } from "vitest";

import { createAppJwt } from "./app-auth";
import { decryptSecret, encryptSecret, signState, verifyState } from "./crypto";
import { privateKeyPemToPkcs8Der } from "./pkcs8";
import { verifyWebhookSignature } from "./webhook";

const SECRET = "test-better-auth-secret";

// Throwaway 2048-bit key generated for this test only (never used anywhere).
const TEST_PKCS1_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEA62x8WaJ6ZJmkJnOcF4FtHMlFriL4d/uk4KXNNW5t0Ljv4ghX
dSaN5I24AT2UDAA0jXpcweZarKWc3h6IaprOwW9vys8H8m9UR0fjJd+uLIn4CpSx
LvAHeBnoZ8ZK3B2K461JVJOiVtdQQxmsHkGaAxmPNJ8kAODU+w9dmkUbq1bOGtd9
NFgMCDs7lhRVwlPQl2bkeoqXFWGfFCQpAstwjMYA/PPnX6KCv16XhenTA85WNx+P
S3bO4DlmBxHvN/0nKO4PWbwkBWGzYeufosY9pejZONoOTcpezoDCRYy3t4Kwm3Fa
dfbI5SLba+4Z7uNlCZZopIiumBDR29H62HpJhwIDAQABAoIBABYT7G1zgUrh5bT9
bov9xT/H2FMGUIrf/IxcwCvcmUvTrBtkcN85qGDgsXrcTX/6nPMPoJdGhQZf2aAy
+NQWhIE7dB5u3+3qZtrwcOriWTEwFyTW4O7n76thspvYyrhtxNKpM5FM7xJ5yrsg
MzX7LPhRc06aBgRXEWIiBMMs6/VbVpEGqf2IUcrKibtBaRXQBQYpM+VrTDj2ouQ5
+rJToX5lbEwvqqP7/+TRyiSiE3QhNLLWuUxfM1IkFGneYItYaVS+QCAaFmCIYUj+
k4ZyDRI8/SQ+MHVvPvTqJnbg0UjErXK7Tiacteklse5LAd2ILRoUyUDfEBBkEZsM
bJSqfEECgYEA/sRfz/p87IuA1Y083GUkGEb85243YzqfTZLpLNHEOZGagLhF/lcs
PkTxhL7wGXiThWQz5gH8/5S5HJw43p1f0Bqw8AJQsV/K3pMxqHpt6LE4D/Tabh0w
cnUGb+/zOeI4TOnmza5zbDckd+4Fp4xwIvCNSmPIuMLe0Go9yjnMBTcCgYEA7JAl
voumVcGxITtxvjUR8d8GWhNF43QBuG9zLamkVnhB9v70Gl1oXEUKO2m/KCp71+cw
Ih5ivyk0NIJ5VC1G7GAlbWJ9lrFNx4Eskrsl86RhgSeJIpRqFtQ5nlmg0NLLAVVf
hvOL1mVd+rFvesaqdrySBJvfqTa9yyovJ6kiBjECgYByi6RwhDUKvaZNXdVRWoAi
Eji/bUSl7sOVQ0pnhmDtaVPIMBH4SwVvcdwNTTPyn83kGatj7NztpNad0HeZT7S2
gmmvX7scJO+3pwKat4EXMCb+tZ5ICAOyUn90cLQxAE9D9Z56N8dZjmltKq2MKY55
hyJfogGrYKKBnmLtu5LJfQKBgEqlkcN2vZ4B6Krb3yBuDqOMBK0Xt832JTTVtjqK
dVjzyZzvBofrQasb/gaRb8h0329ZfE7H19EKZ3bKVQ7C2sZr8GN72LVcbXauxCno
9CjVjg77MsK+olthzGyzS5OZcIWTMvmakF2uzuD0bIEJf3DIQCtEJGd45prdTNPv
AtWBAoGAEOWEO2WzWAlWE6vgsvo0JIvFniQJM3/nPJ1NqCQHcCfWuFeVZJxlL4oX
Ypw01VAyZ4Tof8zkqNedqppvkxxHhDvexAj42ajTQuC+e1wo1D9Usx/tSD2jn5F0
6tg9hYJdlMiU6fK5ZYf8xH433wUEhrRAvDONLToq/tsys3dUyJk=
-----END RSA PRIVATE KEY-----`;

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
