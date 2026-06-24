export const PAT_PREFIX = "spantail_pat_";
/** Agent access token: a write-only ingest credential bound to one agent. */
export const AAT_PREFIX = "spantail_aat_";

const PAT_PATTERN = tokenPattern(PAT_PREFIX);
const AAT_PATTERN = tokenPattern(AAT_PREFIX);

/** `<prefix>` + exactly 43 base64url chars (32 random bytes, unpadded). */
function tokenPattern(prefix: string): RegExp {
	const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^${escaped}[A-Za-z0-9_-]{43}$`);
}

/** Generates a token: `<prefix>` + 32 random bytes, base64url. */
function generateToken(prefix: string): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	const base64url = btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
	return `${prefix}${base64url}`;
}

/** SHA-256 hex digest of a token; only the hash is ever stored. */
export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

/** Back-compat alias; hashing is identical for every token kind. */
export const hashPat = hashToken;

export function generatePat(): string {
	return generateToken(PAT_PREFIX);
}

export function isPatFormat(value: string): boolean {
	return PAT_PATTERN.test(value);
}

export function generateAat(): string {
	return generateToken(AAT_PREFIX);
}

export function isAatFormat(value: string): boolean {
	return AAT_PATTERN.test(value);
}
