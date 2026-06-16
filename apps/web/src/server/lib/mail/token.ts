import { hashPat } from "@toxil/core";

/**
 * Generates an invitation token: 32 random bytes, base64url. The raw token
 * lives only in the emailed link; only its hash is persisted.
 */
export function generateInviteToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

/** SHA-256 hex digest of an invitation token (shared with the PAT hasher). */
export const hashInviteToken = hashPat;
