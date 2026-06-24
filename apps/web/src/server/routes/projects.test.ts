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
		{ slug: "spantail", name: "Spantail", description: "Work logging" },
		admin,
	);
	expect(created.status).toBe(201);
	const project = (await created.json()) as { id: string; status: string };
	expect(project.status).toBe("active");

	const dup = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/projects`,
		{ slug: "spantail", name: "Other" },
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
			{ slug: "spantail", name: "Spantail" },
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

it("updates a project's name, slug, color and description", async () => {
	const { admin, ws } = await setup();
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "spantail", name: "Spantail" },
			admin,
		)
	).json()) as { id: string };

	const updated = await apiJson(
		"PATCH",
		`/api/v1/projects/${project.id}`,
		{
			name: "Spantail Web",
			slug: "spantail-web",
			description: "The web client",
			hue: 200,
		},
		admin,
	);
	expect(updated.status).toBe(200);
	const body = (await updated.json()) as {
		name: string;
		slug: string;
		description: string | null;
		hue: number | null;
	};
	expect(body.name).toBe("Spantail Web");
	expect(body.slug).toBe("spantail-web");
	expect(body.description).toBe("The web client");
	expect(body.hue).toBe(200);
});

it("creates a project with an explicit colour hue", async () => {
	const { admin, ws } = await setup();
	const created = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/projects`,
		{ slug: "spantail", name: "Spantail", hue: 160 },
		admin,
	);
	expect(created.status).toBe(201);
	const project = (await created.json()) as { hue: number | null };
	expect(project.hue).toBe(160);
});

it("rejects updating a slug to one already used in the workspace", async () => {
	const { admin, ws } = await setup();
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/projects`,
		{ slug: "alpha", name: "Alpha" },
		admin,
	);
	const beta = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "beta", name: "Beta" },
			admin,
		)
	).json()) as { id: string };

	const conflict = await apiJson(
		"PATCH",
		`/api/v1/projects/${beta.id}`,
		{ slug: "alpha" },
		admin,
	);
	expect(conflict.status).toBe(409);
});

it("deletes an archived project and orphans its spans instead of cascading", async () => {
	const { admin, ws } = await setup();
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "spantail", name: "Spantail" },
			admin,
		)
	).json()) as { id: string };
	const span = (await (
		await apiJson(
			"POST",
			"/api/v1/work-spans",
			{
				workspaceId: ws.id,
				projectId: project.id,
				durationMinutes: 60,
				description: "Logged against a soon-deleted project",
			},
			admin,
		)
	).json()) as { id: string };

	// Active projects cannot be deleted; archive first.
	const tooEarly = await apiJson(
		"DELETE",
		`/api/v1/projects/${project.id}`,
		undefined,
		admin,
	);
	expect(tooEarly.status).toBe(409);

	await apiJson(
		"PATCH",
		`/api/v1/projects/${project.id}`,
		{ status: "archived" },
		admin,
	);
	const deleted = await apiJson(
		"DELETE",
		`/api/v1/projects/${project.id}`,
		undefined,
		admin,
	);
	expect(deleted.status).toBe(204);

	// The project is gone...
	expect((await apiGet(`/api/v1/projects/${project.id}`, admin)).status).toBe(
		404,
	);
	// ...but its span survives with a null projectId (ON DELETE SET NULL).
	const spans = (await (
		await apiGet(`/api/v1/work-spans?workspaceId=${ws.id}`, admin)
	).json()) as Array<{ id: string; projectId: string | null }>;
	const survivor = spans.find((e) => e.id === span.id);
	expect(survivor).toBeDefined();
	expect(survivor?.projectId).toBeNull();
});

it("forbids non-admins from deleting projects", async () => {
	const { admin, ws } = await setup();
	const member = await signUpUser("Member", "member@example.com");
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "spantail", name: "Spantail" },
			admin,
		)
	).json()) as { id: string };
	await apiJson(
		"PATCH",
		`/api/v1/projects/${project.id}`,
		{ status: "archived" },
		admin,
	);

	const denied = await apiJson(
		"DELETE",
		`/api/v1/projects/${project.id}`,
		undefined,
		member,
	);
	expect(denied.status).toBe(403);
});
