const te = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
	if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/**
 * Verifies GitHub's `X-Hub-Signature-256: sha256=<hex hmac>` over the raw
 * request body. `crypto.subtle.verify` compares in constant time, so this is
 * not vulnerable to byte-wise probing.
 */
export async function verifyWebhookSignature(
	secret: string,
	body: ArrayBuffer,
	signature256: string | undefined,
): Promise<boolean> {
	if (!signature256?.startsWith("sha256=")) return false;
	const mac = hexToBytes(signature256.slice("sha256=".length));
	if (!mac) return false;
	const key = await crypto.subtle.importKey(
		"raw",
		te.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	return crypto.subtle.verify("HMAC", key, mac as BufferSource, body);
}
