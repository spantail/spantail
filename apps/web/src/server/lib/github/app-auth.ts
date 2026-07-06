import type { GithubAppConfigRow } from "@spantail/db";

import { createInstallationToken } from "./api";
import { decryptSecret, fromBase64, toBase64Url } from "./crypto";

/**
 * App JWT (RS256) and installation-token minting. Tokens live one hour and
 * are cached per isolate — isolates are ephemeral and short-lived, so a
 * plain Map is the right amount of caching (no KV round-trips).
 */

const te = new TextEncoder();

/** GitHub caps App JWT lifetime at 10 minutes; 9 keeps clock skew safe. */
const JWT_TTL_SECONDS = 540;

export async function createAppJwt(
	appId: number,
	privateKeyPkcs8Der: Uint8Array,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"pkcs8",
		privateKeyPkcs8Der as BufferSource,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
	const now = Math.floor(Date.now() / 1000);
	const header = toBase64Url(
		te.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
	);
	// iat is backdated 60s to absorb clock drift, per GitHub's guidance.
	const payload = toBase64Url(
		te.encode(
			JSON.stringify({
				iat: now - 60,
				exp: now + JWT_TTL_SECONDS,
				iss: String(appId),
			}),
		),
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		key,
		te.encode(`${header}.${payload}`),
	);
	return `${header}.${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

const tokenCache = new Map<number, { token: string; expiresAtMs: number }>();

export function clearInstallationTokenCache(): void {
	tokenCache.clear();
}

/**
 * A short-lived installation token for GitHub API calls, minted from the
 * stored (encrypted) App private key and cached until 60s before expiry.
 */
export async function getInstallationToken(
	authSecret: string,
	config: GithubAppConfigRow,
	installationId: number,
): Promise<string> {
	const cached = tokenCache.get(installationId);
	if (cached && cached.expiresAtMs - 60_000 > Date.now()) return cached.token;

	const pkcs8Base64 = await decryptSecret(authSecret, config.privateKeyEnc);
	const jwt = await createAppJwt(config.appId, fromBase64(pkcs8Base64));
	const minted = await createInstallationToken(jwt, installationId);
	tokenCache.set(installationId, {
		token: minted.token,
		expiresAtMs: Date.parse(minted.expires_at),
	});
	return minted.token;
}
