import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

it("returns a structured 401 for anonymous requests", async () => {
	const res = await apiGet("/api/v1/me");

	expect(res.status).toBe(401);
	expect(await res.json()).toEqual({
		error: { code: "unauthorized", message: "Authentication required" },
	});
});

it("returns the user and memberships for a session", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");

	const res = await apiGet("/api/v1/me", cookie);

	expect(res.status).toBe(200);
	const body = (await res.json()) as {
		user: { email: string; isAdmin: boolean };
		memberships: unknown[];
	};
	expect(body.user.email).toBe("alice@example.com");
	expect(body.user.isAdmin).toBe(true);
	expect(body.memberships).toEqual([]);
});

it("sets and clears the caller's timezone preference", async () => {
	const cookie = await signUpUser("Tz", "tz@example.com");

	// Defaults to null (the UTC fallback) until the user sets one.
	const initial = (await (await apiGet("/api/v1/me", cookie)).json()) as {
		user: { timezone: string | null };
	};
	expect(initial.user.timezone).toBeNull();

	const set = await apiJson(
		"PATCH",
		"/api/v1/me",
		{ timezone: "Asia/Tokyo" },
		cookie,
	);
	expect(set.status).toBe(200);
	const setBody = (await set.json()) as { user: { timezone: string | null } };
	expect(setBody.user.timezone).toBe("Asia/Tokyo");

	// Persisted server-side, visible on the next read.
	const persisted = (await (await apiGet("/api/v1/me", cookie)).json()) as {
		user: { timezone: string | null };
	};
	expect(persisted.user.timezone).toBe("Asia/Tokyo");

	// Null clears it back to the UTC fallback.
	const cleared = await apiJson(
		"PATCH",
		"/api/v1/me",
		{ timezone: null },
		cookie,
	);
	expect(cleared.status).toBe(200);
	const clearedBody = (await cleared.json()) as {
		user: { timezone: string | null };
	};
	expect(clearedBody.user.timezone).toBeNull();

	// An invalid IANA name is rejected at the boundary.
	const bad = await apiJson(
		"PATCH",
		"/api/v1/me",
		{ timezone: "Mars/Olympus" },
		cookie,
	);
	expect(bad.status).toBe(400);
});

it("returns a structured 404 for unknown api paths", async () => {
	const res = await apiGet("/api/v1/nope");

	expect(res.status).toBe(404);
	const body = (await res.json()) as { error: { code: string } };
	expect(body.error.code).toBe("not_found");
});
