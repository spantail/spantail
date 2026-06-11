import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "UTC" },
			admin,
		)
	).json()) as { id: string };
	return { admin, ws };
}

it("creates, lists, and guards projects", async () => {
	const { admin, ws } = await setup();
	const member = await signUpUser("Member", "member@example.com");
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);

	const created = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/projects`,
		{ slug: "toxil", name: "Toxil", description: "Work logging" },
		admin,
	);
	expect(created.status).toBe(201);
	const project = (await created.json()) as { id: string; status: string };
	expect(project.status).toBe("active");

	const dup = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/projects`,
		{ slug: "toxil", name: "Other" },
		admin,
	);
	expect(dup.status).toBe(409);

	const memberCreate = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/projects`,
		{ slug: "side", name: "Side" },
		member,
	);
	expect(memberCreate.status).toBe(403);

	const listed = (await (
		await apiGet(`/api/v1/workspaces/${ws.id}/projects`, member)
	).json()) as unknown[];
	expect(listed).toHaveLength(1);

	const fetched = await apiGet(`/api/v1/projects/${project.id}`, member);
	expect(fetched.status).toBe(200);
});

it("archives a project via status and hides nothing from members", async () => {
	const { admin, ws } = await setup();
	const created = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "toxil", name: "Toxil" },
			admin,
		)
	).json()) as { id: string };

	const archived = await apiJson(
		"PATCH",
		`/api/v1/projects/${created.id}`,
		{ status: "archived" },
		admin,
	);
	expect(archived.status).toBe(200);
	const body = (await archived.json()) as {
		status: string;
		archivedAt: string | null;
	};
	expect(body.status).toBe("archived");
	expect(body.archivedAt).not.toBeNull();

	const outsider = await signUpUser("Outsider", "outsider@example.com");
	const denied = await apiGet(`/api/v1/projects/${created.id}`, outsider);
	expect(denied.status).toBe(404);
});
