import { z } from "zod";

// 16 random bytes, base64url. Unlike PATs the token is stored in plaintext:
// a leaked database already exposes the rendered markdown itself, so hashing
// the capability token would add nothing, while plaintext lets the UI offer
// the share URL again after creation.
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function toBase64url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

/** Generates a share-link token: 16 random bytes, base64url (22 chars). */
export function generateShareToken(): string {
	return toBase64url(crypto.getRandomValues(new Uint8Array(16)));
}

export function isShareTokenFormat(value: string): boolean {
	return SHARE_TOKEN_PATTERN.test(value);
}

// Share passcodes are user-chosen secrets and people reuse passwords, so they
// get a real KDF instead of the plain SHA-256 used for high-entropy PATs.
// 100k iterations is the PBKDF2 ceiling on Cloudflare Workers.
const PASSCODE_VERSION = "v1";
const PASSCODE_ITERATIONS = 100_000;

async function derivePasscodeKey(
	passcode: string,
	salt: Uint8Array<ArrayBuffer>,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(passcode),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt,
			iterations: PASSCODE_ITERATIONS,
		},
		key,
		256,
	);
	return toBase64url(new Uint8Array(bits));
}

/** Hashes a share passcode as `v1:<salt>:<derived>` (both base64url). */
export async function hashSharePasscode(passcode: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const derived = await derivePasscodeKey(passcode, salt);
	return `${PASSCODE_VERSION}:${toBase64url(salt)}:${derived}`;
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> | null {
	try {
		const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
		return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
	} catch {
		return null;
	}
}

/**
 * Verifies a passcode against a stored hash. Malformed or unknown-version
 * values verify as false rather than throwing. A plain comparison of the
 * derived values is fine: PBKDF2 output cannot be probed incrementally.
 */
export async function verifySharePasscode(
	passcode: string,
	stored: string,
): Promise<boolean> {
	const [version, saltPart, derivedPart] = stored.split(":");
	if (version !== PASSCODE_VERSION || !saltPart || !derivedPart) return false;
	const salt = fromBase64url(saltPart);
	if (!salt) return false;
	return (await derivePasscodeKey(passcode, salt)) === derivedPart;
}

/**
 * Share as exposed by the API: the passcode hash and the minting user never
 * leave the server (every listing is already scoped to the caller's own
 * shares). `reportContentId` names the immutable version the link serves.
 */
export const reportShareSchema = z.object({
	id: z.string(),
	reportContentId: z.string(),
	token: z.string(),
	hasPasscode: z.boolean(),
	expiresAt: z.string().nullable(),
	revokedAt: z.string().nullable(),
	viewCount: z.number().int(),
	lastViewedAt: z.string().nullable(),
	createdAt: z.string(),
});
export type ReportShare = z.infer<typeof reportShareSchema>;

export const createReportShareInputSchema = z.object({
	expiresInDays: z.number().int().min(1).max(365).optional(),
	passcode: z.string().min(4).max(128).optional(),
});
export type CreateReportShareInput = z.infer<
	typeof createReportShareInputSchema
>;

export type ShareStatus = "active" | "expired" | "revoked";

/** Display status of a share; revocation wins over expiry. */
export function shareStatus(
	share: { revokedAt: string | null; expiresAt: string | null },
	now: Date = new Date(),
): ShareStatus {
	if (share.revokedAt) return "revoked";
	if (share.expiresAt && new Date(share.expiresAt) < now) return "expired";
	return "active";
}
