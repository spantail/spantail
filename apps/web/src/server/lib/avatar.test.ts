import { describe, expect, it } from "vitest";

import { newAvatarToken, readBodyWithLimit, resolveAvatarUrl } from "./avatar";

/** A stream that emits `count` chunks of `size` bytes — no Content-Length. */
function chunkedStream(
	count: number,
	size: number,
): ReadableStream<Uint8Array> {
	let emitted = 0;
	return new ReadableStream({
		pull(controller) {
			if (emitted >= count) {
				controller.close();
				return;
			}
			emitted++;
			controller.enqueue(new Uint8Array(size));
		},
	});
}

describe("readBodyWithLimit", () => {
	it("returns the bytes when under the cap", async () => {
		const out = await readBodyWithLimit(chunkedStream(3, 10), 100);
		expect(out).not.toBeNull();
		expect(out?.byteLength).toBe(30);
	});

	it("aborts and returns null once the cap is exceeded", async () => {
		// 5 × 30 bytes = 150 > 100; should bail mid-stream without buffering all.
		const out = await readBodyWithLimit(chunkedStream(5, 30), 100);
		expect(out).toBeNull();
	});

	it("treats a missing body as empty", async () => {
		const out = await readBodyWithLimit(null, 100);
		expect(out?.byteLength).toBe(0);
	});
});

describe("resolveAvatarUrl", () => {
	it("returns null when there is no stored image", () => {
		expect(resolveAvatarUrl("u1", null)).toBeNull();
		expect(resolveAvatarUrl("u1", undefined)).toBeNull();
		expect(resolveAvatarUrl("u1", "")).toBeNull();
	});

	it("passes an external OAuth picture URL through unchanged", () => {
		const url = "https://example.com/avatar.png";
		expect(resolveAvatarUrl("u1", url)).toBe(url);
		expect(resolveAvatarUrl("u1", "http://cdn/pic.jpg")).toBe(
			"http://cdn/pic.jpg",
		);
	});

	it("builds a Worker-served URL with the cache-busting token", () => {
		expect(resolveAvatarUrl("u1", "abc123")).toBe(
			"/api/v1/avatars/u1?v=abc123",
		);
	});
});

describe("newAvatarToken", () => {
	it("is a short, URL-safe, changing token", () => {
		const a = newAvatarToken();
		const b = newAvatarToken();
		expect(a).toMatch(/^[a-f0-9]{16}$/);
		expect(a).not.toBe(b);
	});
});
