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
	periodUnit: "day" as const,
};

it("lists builtins with cadence plus workspace templates", async () => {
	const { admin, ws } = await setup();

	const created = await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/report-templates`,
		templateInput,
		admin,
	);
	expect(created.status).toBe(201);
	expect(((await created.json()) as { periodUnit: string }).periodUnit).toBe(
		"day",
	);

	const res = await apiGet(
		`/api/v1/workspaces/${ws.id}/report-templates`,
		admin,
	);
	expect(res.status).toBe(200);
	const list = (await res.json()) as Array<{
		id: string;
		builtin: boolean;
		name: string;
		enabled: boolean;
		periodUnit: string;
	}>;
	expect(list.filter((t) => t.builtin).map((t) => t.id)).toEqual([
		"builtin:daily",
		"builtin:weekly",
		"builtin:monthly",
	]);
	// Builtins carry their natural cadence and default to enabled.
	const weekly = list.find((t) => t.id === "builtin:weekly");
	expect(weekly?.periodUnit).toBe("week");
	expect(weekly?.enabled).toBe(true);
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

it("restricts custom template management to admins", async () => {
	const { admin, member, outsider, ws } = await setup();

	// Members can read but not create.
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/workspaces/${ws.id}/report-templates`,
				templateInput,
				member,
			)
		).status,
	).toBe(403);

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

	// Members cannot edit or delete.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/report-templates/${template.id}`,
				{ name: "Member edit" },
				member,
			)
		).status,
	).toBe(403);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/report-templates/${template.id}`,
				undefined,
				member,
			)
		).status,
	).toBe(403);

	// Admins can.
	const updated = await apiJson(
		"PATCH",
		`/api/v1/report-templates/${template.id}`,
		{ name: "Standup v2" },
		admin,
	);
	expect(updated.status).toBe(200);
	expect(((await updated.json()) as { name: string }).name).toBe("Standup v2");
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/report-templates/${template.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);
});

it("toggles enabled and cadence via the admin state route", async () => {
	const { admin, member, ws } = await setup();

	// Builtin: disable via workspace settings.
	const disableWeekly = await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}/report-templates/builtin:weekly/state`,
		{ enabled: false },
		admin,
	);
	expect(disableWeekly.status).toBe(200);

	// Members cannot change template state.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/workspaces/${ws.id}/report-templates/builtin:daily/state`,
				{ enabled: false },
				member,
			)
		).status,
	).toBe(403);

	// Custom: flip enabled + cadence.
	const template = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/report-templates`,
			templateInput,
			admin,
		)
	).json()) as { id: string };
	const state = await apiJson(
		"PATCH",
		`/api/v1/workspaces/${ws.id}/report-templates/${template.id}/state`,
		{ enabled: false, periodUnit: "month" },
		admin,
	);
	expect(state.status).toBe(200);

	const list = (await (
		await apiGet(`/api/v1/workspaces/${ws.id}/report-templates`, admin)
	).json()) as Array<{ id: string; enabled: boolean; periodUnit: string }>;
	expect(list.find((t) => t.id === "builtin:weekly")?.enabled).toBe(false);
	const custom = list.find((t) => t.id === template.id);
	expect(custom?.enabled).toBe(false);
	expect(custom?.periodUnit).toBe("month");
});

it("keeps builtin template bodies read-only but fetchable", async () => {
	const { admin, member } = await setup();

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
				admin,
			)
		).status,
	).toBe(403);
	expect(
		(
			await apiJson(
				"DELETE",
				"/api/v1/report-templates/builtin:daily",
				undefined,
				admin,
			)
		).status,
	).toBe(403);
	expect(
		(await apiGet("/api/v1/report-templates/builtin:nope", member)).status,
	).toBe(404);
});

it("refuses to delete a template referenced by a report", async () => {
	const { admin, ws } = await setup();
	const template = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/report-templates`,
			templateInput,
			admin,
		)
	).json()) as { id: string };
	await apiJson(
		"POST",
		"/api/v1/reports",
		{
			name: "Daily",
			templateId: template.id,
			filters: { workspaceIds: [ws.id], dateRange: "today" },
		},
		admin,
	);

	const res = await apiJson(
		"DELETE",
		`/api/v1/report-templates/${template.id}`,
		undefined,
		admin,
	);
	expect(res.status).toBe(409);
	expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
		"conflict",
	);
});
