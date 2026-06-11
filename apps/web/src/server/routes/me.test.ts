import { expect, it } from "vitest";

import { apiGet, signUpUser } from "../../../test/helpers";

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

it("returns a structured 404 for unknown api paths", async () => {
	const res = await apiGet("/api/v1/nope");

	expect(res.status).toBe(404);
	const body = (await res.json()) as { error: { code: string } };
	expect(body.error.code).toBe("not_found");
});
