import { expect, it } from "vitest";

import { apiGet, appFetch, signUpUser } from "../../../test/helpers";

// A 1x1 PNG is unnecessary — the server stores bytes verbatim and never decodes
// them, so any non-empty payload with an allowed content type is a valid upload.
const PNG_BYTES = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function uploadAvatar(cookie: string, contentType: string, body: BodyInit) {
	return appFetch("/api/v1/me/avatar", {
		method: "POST",
		headers: { "content-type": contentType, cookie },
		body,
	});
}

it("uploads, serves, and removes the caller's avatar", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");

	const upload = await uploadAvatar(cookie, "image/png", PNG_BYTES);
	expect(upload.status).toBe(200);
	const { user } = (await upload.json()) as {
		user: { imageUrl: string | null };
	};
	expect(user.imageUrl).toMatch(/^\/api\/v1\/avatars\/[^?]+\?v=[a-f0-9]{16}$/);

	// /me now reflects the resolved avatar URL.
	const me = (await (await apiGet("/api/v1/me", cookie)).json()) as {
		user: { imageUrl: string | null };
	};
	expect(me.user.imageUrl).toBe(user.imageUrl);

	// The avatar is served with the stored content type.
	const served = await apiGet(user.imageUrl ?? "", cookie);
	expect(served.status).toBe(200);
	expect(served.headers.get("content-type")).toBe("image/png");

	// Removing it clears the URL and 404s the object.
	const removed = await appFetch("/api/v1/me/avatar", {
		method: "DELETE",
		headers: { cookie },
	});
	expect(removed.status).toBe(200);
	const after = (await removed.json()) as { user: { imageUrl: string | null } };
	expect(after.user.imageUrl).toBeNull();
	expect((await apiGet(user.imageUrl ?? "", cookie)).status).toBe(404);
});

it("rejects an unsupported content type", async () => {
	const cookie = await signUpUser("Bob", "bob@example.com");
	const res = await uploadAvatar(cookie, "application/pdf", PNG_BYTES);
	expect(res.status).toBe(400);
});

it("rejects an empty upload", async () => {
	const cookie = await signUpUser("Cara", "cara@example.com");
	const res = await uploadAvatar(cookie, "image/png", new Uint8Array());
	expect(res.status).toBe(400);
});

it("requires authentication to upload", async () => {
	const res = await appFetch("/api/v1/me/avatar", {
		method: "POST",
		headers: { "content-type": "image/png" },
		body: PNG_BYTES,
	});
	expect(res.status).toBe(401);
});
