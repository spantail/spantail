/**
 * Encryption-at-rest for the BYO GitHub App credentials and signing for the
 * OAuth/manifest state tokens. Both derive their keys from
 * BETTER_AUTH_SECRET (the one secret every instance already has), so the
 * integration needs no new environment configuration. See docs/security.md.
 */

const te = new TextEncoder();
const td = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
	return toBase64(bytes)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
	const padded = value.replaceAll("-", "+").replaceAll("_", "/");
	return fromBase64(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

export { fromBase64, toBase64, toBase64Url };

// A fresh HKDF info string versions the derivation: bump it only with a
// migration that re-encrypts stored values.
const HKDF_INFO = "spantail:github-app-credentials:v1";

async function aesKey(secret: string): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		te.encode(secret),
		"HKDF",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new Uint8Array(32),
			info: te.encode(HKDF_INFO),
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

/** AES-256-GCM with a random IV per value; output is base64(iv || ciphertext). */
export async function encryptSecret(
	secret: string,
	plaintext: string,
): Promise<string> {
	const key = await aesKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			te.encode(plaintext),
		),
	);
	const out = new Uint8Array(iv.length + ciphertext.length);
	out.set(iv);
	out.set(ciphertext, iv.length);
	return toBase64(out);
}

export async function decryptSecret(
	secret: string,
	stored: string,
): Promise<string> {
	const bytes = fromBase64(stored);
	const key = await aesKey(secret);
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: bytes.slice(0, 12) },
		key,
		bytes.slice(12),
	);
	return td.decode(plaintext);
}

export type StatePurpose = "manifest" | "connect";

interface StatePayload {
	purpose: StatePurpose;
	nonce: string;
	exp: number;
}

async function hmacKey(
	secret: string,
	usage: "sign" | "verify",
): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		te.encode(`spantail:github-state:${secret}`),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		[usage],
	);
}

/**
 * Signed CSRF state for the manifest and connect redirects:
 * base64url(json).base64url(hmac). The same token goes into the GitHub
 * `state` query param and an HttpOnly cookie; the callback only proceeds
 * when both match and verify.
 */
export async function signState(
	secret: string,
	purpose: StatePurpose,
	ttlMs: number,
): Promise<string> {
	const payload: StatePayload = {
		purpose,
		nonce: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
		exp: Date.now() + ttlMs,
	};
	const body = te.encode(JSON.stringify(payload));
	const mac = await crypto.subtle.sign(
		"HMAC",
		await hmacKey(secret, "sign"),
		body,
	);
	return `${toBase64Url(new Uint8Array(body))}.${toBase64Url(new Uint8Array(mac))}`;
}

/** crypto.subtle.verify is constant-time, so tokens can't be forged byte-wise. */
export async function verifyState(
	secret: string,
	token: string,
	purpose: StatePurpose,
): Promise<boolean> {
	const dot = token.indexOf(".");
	if (dot < 0) return false;
	let body: Uint8Array;
	let mac: Uint8Array;
	try {
		body = fromBase64Url(token.slice(0, dot));
		mac = fromBase64Url(token.slice(dot + 1));
	} catch {
		return false;
	}
	const valid = await crypto.subtle.verify(
		"HMAC",
		await hmacKey(secret, "verify"),
		mac,
		body,
	);
	if (!valid) return false;
	try {
		const payload = JSON.parse(td.decode(body)) as StatePayload;
		return payload.purpose === purpose && payload.exp > Date.now();
	} catch {
		return false;
	}
}
