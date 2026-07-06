import { expect, it } from "vitest";

import {
	apiGet,
	apiJson,
	appFetch,
	signUpAdmin,
	signUpUser,
} from "../../../test/helpers";

const WS = { slug: "acme", name: "Acme" };

async function createWs(cookie: string) {
	const res = await apiJson("POST", "/api/v1/workspaces", WS, cookie);
	return (await res.json()) as { id: string };
}

function putLogo(
	id: string,
	body: BodyInit,
	contentType: string,
	cookie: string,
) {
	return appFetch(`/api/v1/workspaces/${id}/logo`, {
		method: "PUT",
		headers: { "content-type": contentType, cookie },
		body,
	});
}

it("lets only instance admins create workspaces", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");

	const denied = await apiJson("POST", "/api/v1/workspaces", WS, member);
	expect(denied.status).toBe(403);

	const created = await apiJson("POST", "/api/v1/workspaces", WS, admin);
	expect(created.status).toBe(201);
	const ws = (await created.json()) as { slug: string; archivedAt: null };
	expect(ws.slug).toBe("acme");
	expect(ws.archivedAt).toBeNull();
});

it("rejects duplicate slugs", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	await createWs(admin);

	const dup = await apiJson("POST", "/api/v1/workspaces", WS, admin);
	expect(dup.status).toBe(409);
});

it("scopes workspace reads to members", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const outsider = await signUpUser("Outsider", "outsider@example.com");
	const ws = await createWs(admin);

	const mine = await apiGet(`/api/v1/workspaces/${ws.id}`, admin);
	expect(mine.status).toBe(200);

	const listed = (await (
		await apiGet("/api/v1/workspaces", admin)
	).json()) as Array<{
		role: string;
	}>;
	expect(listed).toHaveLength(1);
	expect(listed[0]?.role).toBe("owner");

	const denied = await apiGet(`/api/v1/workspaces/${ws.id}`, outsider);
	expect(denied.status).toBe(404);
});

it("lets an instance admin act on a workspace it is not a member of", async () => {
	const admin = await signUpUser("Admin", "admin@example.com"); // bootstrap admin
	const otherAdmin = await signUpAdmin(
		"Other Admin",
		"other-admin@example.com",
	);
	const outsider = await signUpUser("Outsider", "outsider@example.com");

	// otherAdmin owns a workspace the bootstrap admin never joined.
	const ws = (await (
		await apiJson("POST", "/api/v1/workspaces", WS, otherAdmin)
	).json()) as { id: string };

	// Instance-admin bypass: read the container and its nested collections,
	// and write workspace-admin-only routes — all without membership.
	expect((await apiGet(`/api/v1/workspaces/${ws.id}`, admin)).status).toBe(200);
	expect(
		(await apiGet(`/api/v1/workspaces/${ws.id}/members`, admin)).status,
	).toBe(200);
	expect(
		(await apiGet(`/api/v1/workspaces/${ws.id}/projects`, admin)).status,
	).toBe(200);
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/workspaces/${ws.id}`,
				{ name: "Renamed" },
				admin,
			)
		).status,
	).toBe(200);

	// A non-admin non-member still gets 404 (existence is not revealed).
	expect((await apiGet(`/api/v1/workspaces/${ws.id}`, outsider)).status).toBe(
		404,
	);

	// A missing workspace is 404 even for an instance admin.
	expect(
		(await apiGet("/api/v1/workspaces/does-not-exist", admin)).status,
	).toBe(404);
});

it("lists every workspace for an instance admin, role null for non-members", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const otherAdmin = await signUpAdmin(
		"Other Admin",
		"other-admin@example.com",
	);

	const owned = (await (
		await apiJson("POST", "/api/v1/workspaces", WS, admin)
	).json()) as { id: string };
	const foreign = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ ...WS, slug: "beta", name: "Beta" },
			otherAdmin,
		)
	).json()) as { id: string };

	// The collection endpoint and /me both surface every workspace for an admin.
	for (const path of ["/api/v1/workspaces", "/api/v1/me"]) {
		const res = await apiGet(path, admin);
		const payload = (await res.json()) as
			| Array<{ id: string; role: string | null }>
			| { memberships: Array<{ id: string; role: string | null }> };
		const listed = Array.isArray(payload) ? payload : payload.memberships;
		const roleById = new Map(listed.map((w) => [w.id, w.role]));
		expect(listed).toHaveLength(2);
		expect(roleById.get(owned.id)).toBe("owner"); // a member of this one
		expect(roleById.get(foreign.id)).toBeNull(); // not a member of this one
	}
});

it("updates and archives workspaces for admins only", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
	const ws = await createWs(admin);
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);

	const denied = await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}`,
		{ name: "X" },
		member,
	);
	expect(denied.status).toBe(403);

	const renamed = await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}`,
		{ name: "Acme Inc", archived: true },
		admin,
	);
	expect(renamed.status).toBe(200);
	const body = (await renamed.json()) as {
		name: string;
		archivedAt: string | null;
	};
	expect(body.name).toBe("Acme Inc");
	expect(body.archivedAt).not.toBeNull();
});

it("updates the slug and rejects collisions with another workspace", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const ws = await createWs(admin);
	const other = await apiJson(
		"POST",
		"/api/v1/workspaces",
		{ ...WS, slug: "beta" },
		admin,
	);
	const otherWs = (await other.json()) as { id: string };

	const renamed = await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}`,
		{ slug: "acme-renamed" },
		admin,
	);
	expect(renamed.status).toBe(200);
	expect(((await renamed.json()) as { slug: string }).slug).toBe(
		"acme-renamed",
	);

	// Re-applying the same slug to its own workspace is a no-op, not a conflict.
	const same = await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}`,
		{ slug: "acme-renamed" },
		admin,
	);
	expect(same.status).toBe(200);

	// Taking another workspace's slug is rejected.
	const conflict = await apiJson(
		"PATCH",
		`/api/v1/workspaces/${otherWs.id}`,
		{ slug: "acme-renamed" },
		admin,
	);
	expect(conflict.status).toBe(409);
});

it("uploads, serves, and removes a workspace logo", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const ws = await createWs(admin);
	const bytes = new Uint8Array([1, 2, 3, 4, 5]);

	const uploaded = await putLogo(ws.id, bytes, "image/png", admin);
	expect(uploaded.status).toBe(200);
	const body = (await uploaded.json()) as { logoUrl: string | null };
	expect(body.logoUrl).toMatch(
		new RegExp(`^/api/v1/workspaces/${ws.id}/logo\\?v=`),
	);

	const served = await apiGet(`/api/v1/workspaces/${ws.id}/logo`, admin);
	expect(served.status).toBe(200);
	expect(served.headers.get("content-type")).toBe("image/png");
	expect(served.headers.get("cache-control")).toBe("private, no-cache");
	expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);

	// Revalidation re-runs auth and returns 304 when the ETag still matches.
	const etag = served.headers.get("etag");
	expect(etag).toBeTruthy();
	const revalidated = await appFetch(`/api/v1/workspaces/${ws.id}/logo`, {
		headers: { cookie: admin, "if-none-match": etag as string },
	});
	expect(revalidated.status).toBe(304);

	const removed = await apiJson(
		"DELETE",
		`/api/v1/workspaces/${ws.id}/logo`,
		undefined,
		admin,
	);
	expect(removed.status).toBe(200);
	expect(((await removed.json()) as { logoUrl: string | null }).logoUrl).toBe(
		null,
	);

	const gone = await apiGet(`/api/v1/workspaces/${ws.id}/logo`, admin);
	expect(gone.status).toBe(404);
});

it("makes an archived workspace read-only until it is restored", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	await signUpUser("Member", "member@example.com");
	const ws = await createWs(admin);

	const archived = await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}`,
		{ archived: true },
		admin,
	);
	expect(archived.status).toBe(200);

	// Writes across the workspace are rejected with 409.
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/workspaces/${ws.id}/projects`,
				{ slug: "p1", name: "P1" },
				admin,
			)
		).status,
	).toBe(409);
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/workspaces/${ws.id}/members`,
				{ email: "member@example.com" },
				admin,
			)
		).status,
	).toBe(409);
	expect(
		(await putLogo(ws.id, new Uint8Array([1]), "image/png", admin)).status,
	).toBe(409);

	// While archived, PATCH accepts only the `archived` field itself.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/workspaces/${ws.id}`,
				{ name: "Renamed" },
				admin,
			)
		).status,
	).toBe(409);
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/workspaces/${ws.id}`,
				{ archived: false, name: "Renamed" },
				admin,
			)
		).status,
	).toBe(409);

	// Reads still work.
	expect((await apiGet(`/api/v1/workspaces/${ws.id}`, admin)).status).toBe(200);
	expect(
		(await apiGet(`/api/v1/workspaces/${ws.id}/projects`, admin)).status,
	).toBe(200);
	expect(
		(await apiGet(`/api/v1/workspaces/${ws.id}/members`, admin)).status,
	).toBe(200);

	// Unarchiving restores writes.
	const restored = await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}`,
		{ archived: false },
		admin,
	);
	expect(restored.status).toBe(200);
	expect(
		((await restored.json()) as { archivedAt: string | null }).archivedAt,
	).toBeNull();
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/workspaces/${ws.id}/projects`,
				{ slug: "p1", name: "P1" },
				admin,
			)
		).status,
	).toBe(201);
});

it("lets only the owner delete a workspace, not a workspace admin", async () => {
	await signUpUser("Admin", "admin@example.com"); // bootstrap admin
	const owner = await signUpAdmin("Owner", "owner@example.com");
	const memberCookie = await signUpUser("Member", "member@example.com");
	const wsAdminCookie = await signUpUser("WS Admin", "ws-admin@example.com");

	const ws = (await (
		await apiJson("POST", "/api/v1/workspaces", WS, owner)
	).json()) as { id: string };
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		owner,
	);
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "ws-admin@example.com", role: "admin" },
		owner,
	);

	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/workspaces/${ws.id}`,
				undefined,
				memberCookie,
			)
		).status,
	).toBe(403);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/workspaces/${ws.id}`,
				undefined,
				wsAdminCookie,
			)
		).status,
	).toBe(403);

	expect(
		(await apiJson("DELETE", `/api/v1/workspaces/${ws.id}`, undefined, owner))
			.status,
	).toBe(204);
	expect((await apiGet(`/api/v1/workspaces/${ws.id}`, owner)).status).toBe(404);
});

it("lets an instance admin delete a workspace regardless of membership role", async () => {
	const admin = await signUpUser("Admin", "admin@example.com"); // bootstrap admin
	const owner = await signUpAdmin("Owner", "owner@example.com");

	// Not a member at all: the bypass covers the owner requirement.
	const foreign = (await (
		await apiJson("POST", "/api/v1/workspaces", WS, owner)
	).json()) as { id: string };
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/workspaces/${foreign.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);

	// A member with a plain `member` role: the stored role must not demote the
	// instance admin below the owner requirement.
	const joined = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ ...WS, slug: "beta", name: "Beta" },
			owner,
		)
	).json()) as { id: string };
	await apiJson(
		"POST",
		`/api/v1/workspaces/${joined.id}/members`,
		{ email: "admin@example.com" },
		owner,
	);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/workspaces/${joined.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);

	// A missing workspace stays 404.
	expect(
		(
			await apiJson(
				"DELETE",
				"/api/v1/workspaces/does-not-exist",
				undefined,
				admin,
			)
		).status,
	).toBe(404);
});

it("deletes a workspace with its contents, even while archived", async () => {
	const owner = await signUpUser("Owner", "owner@example.com");
	const ws = await createWs(owner);
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "p1", name: "P1" },
			owner,
		)
	).json()) as { id: string };

	await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}`,
		{ archived: true },
		owner,
	);
	expect(
		(await apiJson("DELETE", `/api/v1/workspaces/${ws.id}`, undefined, owner))
			.status,
	).toBe(204);

	// The container and its cascaded contents are gone.
	expect((await apiGet(`/api/v1/workspaces/${ws.id}`, owner)).status).toBe(404);
	expect((await apiGet(`/api/v1/projects/${project.id}`, owner)).status).toBe(
		404,
	);
	const memberships = (await (await apiGet("/api/v1/me", owner)).json()) as {
		memberships: unknown[];
	};
	expect(memberships.memberships).toHaveLength(0);
});

it("rejects logo uploads from non-admins and invalid files", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
	const ws = await createWs(admin);
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);

	const png = new Uint8Array([1, 2, 3]);
	expect((await putLogo(ws.id, png, "image/png", member)).status).toBe(403);
	expect((await putLogo(ws.id, png, "text/plain", admin)).status).toBe(400);
	expect((await putLogo(ws.id, "x", "image/svg+xml", admin)).status).toBe(400);

	const tooBig = new Uint8Array(1024 * 1024 + 1);
	expect((await putLogo(ws.id, tooBig, "image/png", admin)).status).toBe(400);
});
