import { env } from "cloudflare:workers";
import { defaultTemplateForLocale } from "@spantail/templates";
import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

/** admin is the bootstrap instance admin; member is a regular user. */
async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const member = await signUpUser("Member", "member@example.com");
	// Read once so the instance default is lazily seeded — the normal state in
	// which templates are created (so a custom one isn't the sole default).
	await apiGet("/api/v1/report-templates", admin);
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
	body: "# {{ report.name }}\n{% for e in entries %}- {{ e.description }}\n{% endfor %}",
};

it("seeds a default template for the first admin and lists custom ones", async () => {
	const { admin } = await setup();

	// The bootstrap admin's instance is seeded with exactly one default template.
	const seeded = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ id: string; name: string; enabled: boolean }>;
	expect(seeded.length).toBe(1);
	expect(seeded[0]?.enabled).toBe(true);

	const created = await apiJson(
		"POST",
		"/api/v1/report-templates",
		templateInput,
		admin,
	);
	expect(created.status).toBe(201);

	const res = await apiGet("/api/v1/report-templates", admin);
	expect(res.status).toBe(200);
	const list = (await res.json()) as Array<{ id: string; name: string }>;
	expect(list.map((t) => t.name)).toContain("Standup");
	expect(list.length).toBe(2);
});

it("lazily seeds the default template in the request locale", async () => {
	const admin = await signUpUser("Admin", "admin@example.com");

	const res = await appFetch("/api/v1/report-templates", {
		headers: { cookie: admin, "accept-language": "ja,en;q=0.8" },
	});
	expect(res.status).toBe(200);
	const list = (await res.json()) as Array<{ name: string }>;
	expect(list.map((t) => t.name)).toEqual([
		defaultTemplateForLocale("ja").name,
	]);
});

it("re-seeds the default when an instance is left with no templates", async () => {
	// Covers upgraded instances (builtins removed → empty table) and confirms
	// the lazy seed is idempotent rather than one-shot. The default is delete-
	// protected via the API, so emptying the table is simulated out-of-band.
	const admin = await signUpUser("Admin", "admin@example.com");

	const seeded = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ id: string }>;
	expect(seeded.length).toBe(1);

	await env.DB.prepare("DELETE FROM report_templates").run();

	// A later read finds the table empty again and re-seeds the default.
	const again = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ id: string; isDefault: boolean }>;
	expect(again.length).toBe(1);
	expect(again[0]?.isDefault).toBe(true);
});

it("lets any authenticated user read templates but not anonymous callers", async () => {
	const { admin, member } = await setup();
	await apiJson("POST", "/api/v1/report-templates", templateInput, admin);

	// Templates are instance-wide formats: every member can read the list. The
	// admin already created a custom template, so the default isn't lazily added
	// (the table was non-empty); the member still sees the custom one.
	const memberList = await apiGet("/api/v1/report-templates", member);
	expect(memberList.status).toBe(200);
	expect(
		((await memberList.json()) as unknown[]).length,
	).toBeGreaterThanOrEqual(1);

	// Anonymous callers are rejected.
	expect((await apiGet("/api/v1/report-templates")).status).toBe(401);
});

it("restricts template management to admins and template authors", async () => {
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

it("toggles enabled via the state route", async () => {
	const { admin, member } = await setup();

	const template = (await (
		await apiJson("POST", "/api/v1/report-templates", templateInput, admin)
	).json()) as { id: string };

	// Members cannot change template state.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/report-templates/${template.id}/state`,
				{ enabled: false },
				member,
			)
		).status,
	).toBe(403);

	const state = await apiJson(
		"PATCH",
		`/api/v1/report-templates/${template.id}/state`,
		{ enabled: false },
		admin,
	);
	expect(state.status).toBe(200);

	const list = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ id: string; enabled: boolean }>;
	expect(list.find((t) => t.id === template.id)?.enabled).toBe(false);
});

it("fetches a template by id and 404s for unknown ids", async () => {
	const { admin, member } = await setup();
	const template = (await (
		await apiJson("POST", "/api/v1/report-templates", templateInput, admin)
	).json()) as { id: string };

	const res = await apiGet(`/api/v1/report-templates/${template.id}`, member);
	expect(res.status).toBe(200);
	expect(((await res.json()) as { body: string }).body).toContain(
		"{{ report.name }}",
	);

	expect(
		(await apiGet("/api/v1/report-templates/does-not-exist", member)).status,
	).toBe(404);
});

it("makes the first created template the default when none exists yet", async () => {
	// A POST before anyone lists templates (so the lazy seed never ran): the
	// instance has no default, so the created template must become it.
	const admin = await signUpUser("Admin", "admin@example.com");

	const created = (await (
		await apiJson("POST", "/api/v1/report-templates", templateInput, admin)
	).json()) as { id: string; isDefault: boolean };
	expect(created.isDefault).toBe(true);

	// A second template, now that a default exists, is not default.
	const second = (await (
		await apiJson(
			"POST",
			"/api/v1/report-templates",
			{ ...templateInput, name: "Second" },
			admin,
		)
	).json()) as { isDefault: boolean };
	expect(second.isDefault).toBe(false);
});

it("flags the seeded template as default and protects it", async () => {
	const { admin } = await setup();

	const seeded = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ id: string; isDefault: boolean }>;
	expect(seeded.length).toBe(1);
	expect(seeded[0]?.isDefault).toBe(true);
	const id = seeded[0]?.id as string;

	// The default cannot be deleted...
	const del = await apiJson(
		"DELETE",
		`/api/v1/report-templates/${id}`,
		undefined,
		admin,
	);
	expect(del.status).toBe(409);

	// ...nor disabled.
	const dis = await apiJson(
		"PATCH",
		`/api/v1/report-templates/${id}/state`,
		{ enabled: false },
		admin,
	);
	expect(dis.status).toBe(409);
});

it("moves the default to another template, keeping exactly one", async () => {
	const { admin, member } = await setup();

	const seeded = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ id: string }>;
	const original = seeded[0]?.id as string;
	const created = (await (
		await apiJson("POST", "/api/v1/report-templates", templateInput, admin)
	).json()) as { id: string };

	// Members cannot set the default.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/report-templates/${created.id}/default`,
				undefined,
				member,
			)
		).status,
	).toBe(403);

	const res = await apiJson(
		"PATCH",
		`/api/v1/report-templates/${created.id}/default`,
		undefined,
		admin,
	);
	expect(res.status).toBe(200);

	const list = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ id: string; isDefault: boolean }>;
	expect(list.filter((t) => t.isDefault).map((t) => t.id)).toEqual([
		created.id,
	]);
	expect(list.find((t) => t.id === original)?.isDefault).toBe(false);

	// The new default is now delete-protected; the old one is freely deletable.
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/report-templates/${created.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(409);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/report-templates/${original}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);
});

it("refuses to set a disabled template as the default", async () => {
	const { admin } = await setup();
	const created = (await (
		await apiJson("POST", "/api/v1/report-templates", templateInput, admin)
	).json()) as { id: string };
	await apiJson(
		"PATCH",
		`/api/v1/report-templates/${created.id}/state`,
		{ enabled: false },
		admin,
	);
	const res = await apiJson(
		"PATCH",
		`/api/v1/report-templates/${created.id}/default`,
		undefined,
		admin,
	);
	expect(res.status).toBe(409);
});

it("refuses to delete a template referenced by a report", async () => {
	const { admin } = await setup();
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme" },
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
