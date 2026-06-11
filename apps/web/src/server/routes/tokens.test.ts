import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

it("creates, lists, and revokes tokens via sessions only", async () => {
	const cookie = await signUpUser("Alice", "alice@example.com");

	const created = await apiJson(
		"POST",
		"/api/v1/tokens",
		{ name: "dev", scopes: ["read", "write"], expiresInDays: 30 },
		cookie,
	);
	expect(created.status).toBe(201);
	const body = (await created.json()) as {
		id: string;
		token: string;
		expiresAt: string | null;
		tokenHash?: string;
	};
	expect(body.token).toMatch(/^toxil_pat_/);
	expect(body.tokenHash).toBeUndefined();
	expect(body.expiresAt).not.toBeNull();

	// The token authenticates against the API.
	const viaPat = await appFetch("/api/v1/me", {
		headers: { authorization: `Bearer ${body.token}` },
	});
	expect(viaPat.status).toBe(200);

	// Listing never reveals the token or its hash.
	const listed = (await (
		await apiGet("/api/v1/tokens", cookie)
	).json()) as Array<{
		id: string;
		token?: string;
		tokenHash?: string;
	}>;
	expect(listed).toHaveLength(1);
	expect(listed[0]?.token).toBeUndefined();
	expect(listed[0]?.tokenHash).toBeUndefined();

	// PATs cannot manage tokens.
	const patManage = await appFetch("/api/v1/tokens", {
		headers: { authorization: `Bearer ${body.token}` },
	});
	expect(patManage.status).toBe(403);

	// Revocation cuts access immediately.
	const revoked = await apiJson(
		"DELETE",
		`/api/v1/tokens/${body.id}`,
		undefined,
		cookie,
	);
	expect(revoked.status).toBe(204);
	const afterRevoke = await appFetch("/api/v1/me", {
		headers: { authorization: `Bearer ${body.token}` },
	});
	expect(afterRevoke.status).toBe(401);
});

it("cannot revoke another user's token", async () => {
	const alice = await signUpUser("Alice", "alice@example.com");
	const bob = await signUpUser("Bob", "bob@example.com");
	const created = (await (
		await apiJson(
			"POST",
			"/api/v1/tokens",
			{ name: "t", scopes: ["read"] },
			alice,
		)
	).json()) as { id: string };

	const denied = await apiJson(
		"DELETE",
		`/api/v1/tokens/${created.id}`,
		undefined,
		bob,
	);
	expect(denied.status).toBe(404);
});
