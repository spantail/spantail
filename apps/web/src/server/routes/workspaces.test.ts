import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

const WS = { slug: "acme", name: "Acme", timezone: "Asia/Tokyo" };

async function createWs(cookie: string) {
	const res = await apiJson("POST", "/api/v1/workspaces", WS, cookie);
	return (await res.json()) as { id: string };
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

it("rejects duplicate slugs and invalid timezones", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");
	await createWs(admin);

	const dup = await apiJson("POST", "/api/v1/workspaces", WS, admin);
	expect(dup.status).toBe(409);

	const badTz = await apiJson(
		"POST",
		"/api/v1/workspaces",
		{ ...WS, slug: "other", timezone: "Mars/Olympus" },
		admin,
	);
	expect(badTz.status).toBe(400);
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
	expect((await renamed.json()).slug).toBe("acme-renamed");

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
