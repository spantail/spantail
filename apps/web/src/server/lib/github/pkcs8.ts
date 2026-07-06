/**
 * GitHub's manifest conversion returns the App private key as a PKCS#1 PEM
 * ("BEGIN RSA PRIVATE KEY"), but WebCrypto only imports PKCS#8. The wrap is
 * a fixed ASN.1 envelope — PrivateKeyInfo { version 0, rsaEncryption OID,
 * OCTET STRING { pkcs1 } } — so ~30 lines beat a dependency. Conversion
 * happens once at storage time; the signing path always imports PKCS#8.
 */

function pemBody(pem: string, label: string): Uint8Array | null {
	const match = new RegExp(
		`-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+)-----END ${label}-----`,
	).exec(pem);
	if (!match?.[1]) return null;
	const binary = atob(match[1].replace(/\s+/g, ""));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** DER length octets: short form < 128, long form otherwise. */
function derLength(length: number): number[] {
	if (length < 0x80) return [length];
	const bytes: number[] = [];
	let remaining = length;
	while (remaining > 0) {
		bytes.unshift(remaining & 0xff);
		remaining >>= 8;
	}
	return [0x80 | bytes.length, ...bytes];
}

// AlgorithmIdentifier { OID 1.2.840.113549.1.1.1 (rsaEncryption), NULL }.
const RSA_ALG_ID = [
	0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
	0x05, 0x00,
];

/**
 * Converts a PKCS#1 or PKCS#8 PEM private key to PKCS#8 DER bytes suitable
 * for `crypto.subtle.importKey("pkcs8", ...)`. Returns null when the input
 * is neither.
 */
export function privateKeyPemToPkcs8Der(pem: string): Uint8Array | null {
	const pkcs8 = pemBody(pem, "PRIVATE KEY");
	if (pkcs8) return pkcs8;

	const pkcs1 = pemBody(pem, "RSA PRIVATE KEY");
	if (!pkcs1) return null;

	const octetString = [0x04, ...derLength(pkcs1.length)];
	const version = [0x02, 0x01, 0x00];
	const contentLength =
		version.length + RSA_ALG_ID.length + octetString.length + pkcs1.length;
	const header = [0x30, ...derLength(contentLength)];

	const out = new Uint8Array(header.length + contentLength);
	let offset = 0;
	for (const part of [header, version, RSA_ALG_ID, octetString]) {
		out.set(part, offset);
		offset += part.length;
	}
	out.set(pkcs1, offset);
	return out;
}
