import { createHash } from "node:crypto";

// Fixed namespace UUID for the seed's deterministic ids (RFC 4122 §4.3, v5).
// Arbitrary but constant, so `deterministicId(name)` is stable across runs and
// machines. Do not change it: the committed R2 asset filenames are derived from
// the ids it produces (`examples/<name>/r2/avatars/<userId>`), so a new
// namespace would orphan every avatar/logo file.
const NAMESPACE = "6f9619ff-8b86-d011-b42d-00c04fc964ff";

function namespaceBytes(): Buffer {
	return Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
}

/**
 * A deterministic RFC 4122 v5 (SHA-1) UUID for `name`. Same name → same id, on
 * any machine, so seeded user/workspace ids are stable and their R2 object keys
 * (`avatars/<userId>`, `workspaces/<workspaceId>/logo`) can be committed as
 * files. Callers namespace `name` by dataset so `demo` and `demo-ja` never
 * collide (e.g. `demo:user:u-admin`).
 */
export function deterministicId(name: string): string {
	const bytes = createHash("sha1")
		.update(namespaceBytes())
		.update(name, "utf8")
		.digest()
		.subarray(0, 16);
	// digest() is 20 bytes, so indices 6 and 8 always exist (?? 0 satisfies the
	// noUncheckedIndexedAccess type only).
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50; // version 5
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
