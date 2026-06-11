import { env } from "cloudflare:workers";
import { generatePat, hashPat, type TokenScope } from "@toxil/core";
import { createApiToken, createDb } from "@toxil/db";
import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

async function mintToken(
	userEmail: string,
	scopes: TokenScope[],
	expiresAt: Date | null = null,
): Promise<string> {
	const db = createDb(env.DB);
	const me = await (
		await apiGet("/api/v1/me", await signInCookie(userEmail))
	).json();
	const token = generatePat();
	await createApiToken(db, {
		userId: (me as { user: { id: string } }).user.id,
		name: "test",
		tokenHash: await hashPat(token),
		scopes,
		expiresAt,
	});
	return token;
}

const cookies = new Map<string, string>();
async function signInCookie(email: string): Promise<string> {
	const existing = cookies.get(email);
	if (existing) return existing;
	const cookie = await signUpUser(email.split("@")[0] ?? "user", email);
	cookies.set(email, cookie);
	return cookie;
}

async function bearerGet(path: string, token: string) {
	return appFetch(path, { headers: { authorization: `Bearer ${token}` } });
}

async function bearerJson(
	method: "POST" | "PATCH",
	path: string,
	body: unknown,
	token: string,
) {
	return appFetch(path, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

it("authenticates valid tokens and rejects invalid or expired ones", async () => {
	cookies.clear();
	const token = await mintToken("alice@example.com", ["read"]);

	const ok = await bearerGet("/api/v1/me", token);
	expect(ok.status).toBe(200);
	const me = (await ok.json()) as { user: { email: string } };
	expect(me.user.email).toBe("alice@example.com");

	expect(
		(
			await bearerGet(
				"/api/v1/me",
				"toxil_pat_invalidinvalidinvalidinvalidinvalidinv",
			)
		).status,
	).toBe(401);
	expect((await bearerGet("/api/v1/me", "garbage")).status).toBe(401);

	const expired = await mintToken(
		"alice@example.com",
		["read"],
		new Date(Date.now() - 1000),
	);
	expect((await bearerGet("/api/v1/me", expired)).status).toBe(401);
});

it("enforces the scope matrix", async () => {
	cookies.clear();
	const adminCookie = await signInCookie("admin@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "UTC" },
			adminCookie,
		)
	).json()) as { id: string };
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "p", name: "P" },
			adminCookie,
		)
	).json()) as { id: string };

	const readToken = await mintToken("admin@example.com", ["read"]);
	const writeToken = await mintToken("admin@example.com", ["read", "write"]);

	// read scope: GETs pass, mutations fail with insufficient_scope.
	expect(
		(await bearerGet(`/api/v1/work-entries?workspaceId=${ws.id}`, readToken))
			.status,
	).toBe(200);
	const denied = await bearerJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws.id,
			projectId: project.id,
			durationMinutes: 5,
			description: "x",
		},
		readToken,
	);
	expect(denied.status).toBe(403);
	expect(
		((await denied.json()) as { error: { code: string } }).error.code,
	).toBe("insufficient_scope");

	// write scope: entry mutations pass, workspace admin operations fail.
	const created = await bearerJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws.id,
			projectId: project.id,
			durationMinutes: 30,
			description: "via pat",
		},
		writeToken,
	);
	expect(created.status).toBe(201);

	const wsDenied = await bearerJson(
		"POST",
		"/api/v1/workspaces",
		{ slug: "other", name: "Other", timezone: "UTC" },
		writeToken,
	);
	expect(wsDenied.status).toBe(403);
	expect(
		((await wsDenied.json()) as { error: { code: string } }).error.code,
	).toBe("insufficient_scope");
});
