import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
	const res = await apiJson(
		"POST",
		"/api/v1/workspaces",
		{ slug: "acme", name: "Acme", timezone: "UTC" },
		admin,
	);
	const ws = (await res.json()) as { id: string };
	return { admin, member, ws };
}

it("adds registered users by email", async () => {
	const { admin, member, ws } = await setup();

	const unknown = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "ghost@example.com" },
		admin,
	);
	expect(unknown.status).toBe(404);

	const added = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);
	expect(added.status).toBe(201);
	const body = (await added.json()) as { role: string; email: string };
	expect(body.role).toBe("member");

	const dup = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);
	expect(dup.status).toBe(409);

	// The added member can now read the workspace, but cannot manage members.
	expect((await apiGet(`/api/v1/workspaces/${ws.id}`, member)).status).toBe(
		200,
	);
	const denied = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "admin@example.com" },
		member,
	);
	expect(denied.status).toBe(403);
});

it("removes members but never the owner", async () => {
	const { admin, ws } = await setup();
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);
	const members = (await (
		await apiGet(`/api/v1/workspaces/${ws.id}/members`, admin)
	).json()) as {
		userId: string;
		role: string;
	}[];
	expect(members).toHaveLength(2);
	const owner = members.find((m) => m.role === "owner");
	const member = members.find((m) => m.role === "member");
	if (!owner || !member) throw new Error("expected owner and member rows");

	const ownerDenied = await apiJson(
		"DELETE",
		`/api/v1/workspaces/${ws.id}/members/${owner.userId}`,
		undefined,
		admin,
	);
	expect(ownerDenied.status).toBe(403);

	const removed = await apiJson(
		"DELETE",
		`/api/v1/workspaces/${ws.id}/members/${member.userId}`,
		undefined,
		admin,
	);
	expect(removed.status).toBe(204);
});
