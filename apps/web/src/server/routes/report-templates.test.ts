import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

/** admin is the bootstrap instance admin; member is a regular user. */
async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
	return { admin, member };
}

/** Finds a user's id by email via the instance-admin user list. */
async function userIdByEmail(adminCookie: string, email: string) {
	const users = (await (
		await apiGet("/api/v1/users", adminCookie)
	).json()) as Array<{
		id: string;
		email: string;
	}>;
	const found = users.find((u) => u.email === email);
	if (!found) throw new Error(`user ${email} not found`);
	return found.id;
}

const templateInput = {
	name: "Standup",
	description: "Per-day bullets",
	body: "# {{ report.name }}\n{% for e in spans %}- {{ e.description }}\n{% endfor %}",
	periodUnit: "day" as const,
};

it("lists builtins with cadence plus custom templates", async () => {
	const { admin } = await setup();

	const created = await apiJson(
		"POST",
		"/api/v1/report-templates",
		templateInput,
		admin,
	);
	expect(created.status).toBe(201);
	expect(((await created.json()) as { periodUnit: string }).periodUnit).toBe(
		"day",
	);

	const res = await apiGet("/api/v1/report-templates", admin);
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

it("lets any authenticated user read templates but not anonymous callers", async () => {
	const { admin, member } = await setup();
	await apiJson("POST", "/api/v1/report-templates", templateInput, admin);

	// Templates are instance-wide formats: every member can read the list.
	const memberList = await apiGet("/api/v1/report-templates", member);
	expect(memberList.status).toBe(200);
	expect(((await memberList.json()) as unknown[]).length).toBeGreaterThan(3);

	// Anonymous callers are rejected.
	expect((await apiGet("/api/v1/report-templates")).status).toBe(401);
});

it("restricts custom template management to admins and template authors", async () => {
	const { admin, member } = await setup();

	// A regular member can neither create...
	expect(
		(await apiJson("POST", "/api/v1/report-templates", templateInput, member))
			.status,
	).toBe(403);

	const template = (await (
		await apiJson("POST", "/api/v1/report-templates", templateInput, admin)
	).json()) as { id: string };

	// ...nor edit or delete.
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

	// Admins can edit.
	const updated = await apiJson(
		"PATCH",
		`/api/v1/report-templates/${template.id}`,
		{ name: "Standup v2" },
		admin,
	);
	expect(updated.status).toBe(200);
	expect(((await updated.json()) as { name: string }).name).toBe("Standup v2");

	// Granting the template-author capability lets a non-admin manage too.
	const memberId = await userIdByEmail(admin, "member@example.com");
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/users/${memberId}`,
				{ canManageTemplates: true },
				admin,
			)
		).status,
	).toBe(200);
	const authored = await apiJson(
		"POST",
		"/api/v1/report-templates",
		{ ...templateInput, name: "Authored" },
		member,
	);
	expect(authored.status).toBe(201);
});

it("toggles enabled and cadence via the state route", async () => {
	const { admin, member } = await setup();

	// Builtin: disable via the instance override.
	const disableWeekly = await apiJson(
		"PATCH",
		"/api/v1/report-templates/builtin:weekly/state",
		{ enabled: false },
		admin,
	);
	expect(disableWeekly.status).toBe(200);

	// Members cannot change template state.
	expect(
		(
			await apiJson(
				"PATCH",
				"/api/v1/report-templates/builtin:daily/state",
				{ enabled: false },
				member,
			)
		).status,
	).toBe(403);

	// Custom: flip enabled + cadence.
	const template = (await (
		await apiJson("POST", "/api/v1/report-templates", templateInput, admin)
	).json()) as { id: string };
	const state = await apiJson(
		"PATCH",
		`/api/v1/report-templates/${template.id}/state`,
		{ enabled: false, periodUnit: "month" },
		admin,
	);
	expect(state.status).toBe(200);

	const list = (await (
		await apiGet("/api/v1/report-templates", admin)
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
	const { admin } = await setup();
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			admin,
		)
	).json()) as { id: string };
	const template = (await (
		await apiJson("POST", "/api/v1/report-templates", templateInput, admin)
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
