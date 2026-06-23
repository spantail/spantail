import { describe, expect, it } from "vitest";

import { newAvatarToken, resolveAvatarUrl } from "./avatar";

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
