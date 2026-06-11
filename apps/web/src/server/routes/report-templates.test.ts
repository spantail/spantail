import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
	const outsider = await signUpUser("Outsider", "outsider@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			admin,
		)
	).json()) as { id: string };
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "member@example.com" },
		admin,
	);
	return { admin, member, outsider, ws };
}

const templateInput = {
	name: "Standup",
	description: "Per-day bullets",
	body: "# {{ report.name }}\n{% for e in entries %}- {{ e.description }}\n{% endfor %}",
};

it("lists builtins plus workspace templates for members", async () => {
	const { admin, member, ws } = await setup();

	const created = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/report-templates`,
		templateInput,
		member,
	);
	expect(created.status).toBe(201);

	const res = await apiGet(
		`/api/v1/workspaces/${ws.id}/report-templates`,
		admin,
	);
	expect(res.status).toBe(200);
	const list = (await res.json()) as Array<{
		id: string;
		builtin: boolean;
		name: string;
	}>;
	expect(list.filter((t) => t.builtin).map((t) => t.id)).toEqual([
		"builtin:daily",
		"builtin:weekly",
		"builtin:monthly",
	]);
	expect(list.filter((t) => !t.builtin).map((t) => t.name)).toEqual([
		"Standup",
	]);
});

it("hides workspace templates from non-members", async () => {
	const { outsider, ws } = await setup();

	expect(
		(await apiGet(`/api/v1/workspaces/${ws.id}/report-templates`, outsider))
			.status,
	).toBe(404);

	const res = await apiGet("/api/v1/workspaces/none/report-templates");
	expect(res.status).toBe(401);
});

it("updates and deletes custom templates within the workspace", async () => {
	const { admin, member, outsider, ws } = await setup();
	const template = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/report-templates`,
			templateInput,
			admin,
		)
	).json()) as { id: string };

	expect(
		(await apiGet(`/api/v1/report-templates/${template.id}`, outsider)).status,
	).toBe(404);

	const updated = await apiJson(
		"PATCH",
		`/api/v1/report-templates/${template.id}`,
		{ name: "Standup v2" },
		member,
	);
	expect(updated.status).toBe(200);
	expect(((await updated.json()) as { name: string }).name).toBe("Standup v2");

	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/report-templates/${template.id}`,
				undefined,
				member,
			)
		).status,
	).toBe(204);
	expect(
		(await apiGet(`/api/v1/report-templates/${template.id}`, member)).status,
	).toBe(404);
});

it("keeps builtin templates read-only but fetchable", async () => {
	const { member } = await setup();

	const res = await apiGet("/api/v1/report-templates/builtin:daily", member);
	expect(res.status).toBe(200);
	const builtin = (await res.json()) as { builtin: boolean; body: string };
	expect(builtin.builtin).toBe(true);
	expect(builtin.body).toContain("{{ report.name }}");

	expect(
		(
			await apiJson(
				"PATCH",
				"/api/v1/report-templates/builtin:daily",
				{ name: "Hijacked" },
				member,
			)
		).status,
	).toBe(403);
	expect(
		(
			await apiJson(
				"DELETE",
				"/api/v1/report-templates/builtin:daily",
				undefined,
				member,
			)
		).status,
	).toBe(403);
	expect(
		(await apiGet("/api/v1/report-templates/builtin:nope", member)).status,
	).toBe(404);
});
