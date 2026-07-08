import { afterEach, expect, it } from "vitest";

import { apiGet, signUpUser } from "../../../test/helpers";
import { setUpdateCheckFetchForTests } from "../lib/update-check";

afterEach(() => setUpdateCheckFetchForTests(null));

const tagResponse = (tag: string) =>
	new Response(JSON.stringify({ tag_name: tag }), {
		headers: { "content-type": "application/json" },
	});

it("returns the instance version standing to an admin", async () => {
	setUpdateCheckFetchForTests(async () => tagResponse("v9.9.9"));
	const admin = await signUpUser("Admin", "admin@example.com");

	const res = await apiGet("/api/v1/instance/version", admin);
	expect(res.status).toBe(200);
	const body = (await res.json()) as {
		current: string;
		latest: string | null;
		updateAvailable: boolean;
	};
	// current comes from the build's __APP_VERSION__; assert it's populated
	// rather than a specific tag (it varies with the checkout).
	expect(typeof body.current).toBe("string");
	expect(body.current.length).toBeGreaterThan(0);
	expect(body.latest).toBe("v9.9.9");
});

it("lets a non-admin member read the instance version too", async () => {
	setUpdateCheckFetchForTests(async () => tagResponse("v9.9.9"));
	await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");

	const res = await apiGet("/api/v1/instance/version", member);
	expect(res.status).toBe(200);
	const body = (await res.json()) as { latest: string | null };
	expect(body.latest).toBe("v9.9.9");
});

it("reports no update when the upstream check is unavailable", async () => {
	setUpdateCheckFetchForTests(async () => {
		throw new Error("offline");
	});
	const admin = await signUpUser("Admin", "admin@example.com");

	const res = await apiGet("/api/v1/instance/version", admin);
	expect(res.status).toBe(200);
	const body = (await res.json()) as {
		latest: string | null;
		updateAvailable: boolean;
	};
	expect(body.latest).toBeNull();
	expect(body.updateAvailable).toBe(false);
});
