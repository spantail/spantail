/**
 * Shared fixtures for GitHub integration tests. The key below is a
 * throwaway 2048-bit RSA key generated for these tests only — it has never
 * been used for anything and secures nothing.
 */
export const TEST_PKCS1_PEM = `-----BEGIN RSA PRIVATE KEY-----
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

/** Matches vitest.config.ts's BETTER_AUTH_SECRET test binding. */
export const TEST_AUTH_SECRET = "vitest-only-secret-0123456789abcdefghijklmn";

export const TEST_WEBHOOK_SECRET = "test-webhook-secret";
export const TEST_CLIENT_SECRET = "test-client-secret";

/** Computes GitHub's X-Hub-Signature-256 header for a webhook body. */
export async function signWebhookBody(
	secret: string,
	body: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = new Uint8Array(
		await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(body) as BufferSource,
		),
	);
	const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `sha256=${hex}`;
}
