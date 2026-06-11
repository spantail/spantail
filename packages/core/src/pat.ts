export const PAT_PREFIX = "toxil_pat_";

const PAT_PATTERN = /^toxil_pat_[A-Za-z0-9_-]{43}$/;

/** Generates a personal access token: `toxil_pat_` + 32 random bytes, base64url. */
export function generatePat(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	const base64url = btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
	return `${PAT_PREFIX}${base64url}`;
}

export function isPatFormat(value: string): boolean {
	return PAT_PATTERN.test(value);
}

/** SHA-256 hex digest of the token; only the hash is ever stored. */
export async function hashPat(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}
