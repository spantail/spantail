import { env } from "cloudflare:workers";
import { catalogTemplatesForLocale } from "@spantail/templates";
import { expect, it } from "vitest";

import { apiGet, apiJson, appFetch, signUpUser } from "../../../test/helpers";

/** admin is the bootstrap instance admin; member is a regular user. */
async function setup() {
	// The bootstrap sign-up seeds the starter catalog, so the instance already
	// has its default before any custom template is created.
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
	body: "# {{ report.name }}\n{% for e in entries %}- {{ e.description }}\n{% endfor %}",
};

it("seeds the starter templates at bootstrap signup and lists custom ones", async () => {
	const { admin } = await setup();

	// The bootstrap admin's instance is seeded with the three starter templates.
	const seeded = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ id: string; name: string; enabled: boolean }>;
	expect(seeded.length).toBe(3);
	expect(seeded.every((t) => t.enabled)).toBe(true);

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
	expect(list.length).toBe(4);
});

it("round-trips the optional default date range", async () => {
	const { admin } = await setup();

	// The seeded starter templates each carry their type's default range.
	const seeded = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ defaultDateRange: string | null }>;
	expect(new Set(seeded.map((t) => t.defaultDateRange))).toEqual(
		new Set(["today", "this_week", "this_month"]),
	);

	// A preset set on create round-trips on read.
	const created = (await (
		await apiJson(
			"POST",
			"/api/v1/report-templates",
			{ ...templateInput, defaultDateRange: "this_week" },
			admin,
		)
	).json()) as { id: string; defaultDateRange: string | null };
	expect(created.defaultDateRange).toBe("this_week");

	// An invalid preset is rejected at the boundary.
	expect(
		(
			await apiJson(
				"POST",
				"/api/v1/report-templates",
				{ ...templateInput, name: "Bad", defaultDateRange: "next_week" },
				admin,
			)
		).status,
	).toBe(400);

	// Patching to null clears the preset.
	const cleared = (await (
		await apiJson(
			"PATCH",
			`/api/v1/report-templates/${created.id}`,
			{ defaultDateRange: null },
			admin,
		)
	).json()) as { defaultDateRange: string | null };
	expect(cleared.defaultDateRange).toBeNull();
});

it("seeds the starter templates in the admin's language at bootstrap signup", async () => {
	// The bootstrap sign-up's Accept-Language selects the catalog locale.
	const res = await appFetch("/api/auth/sign-up/email", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"accept-language": "ja,en;q=0.8",
		},
		body: JSON.stringify({
			name: "Admin",
			email: "admin@example.com",
			password: "password1234",
		}),
	});
	expect(res.status).toBe(200);
	const cookie = res.headers.get("set-cookie")?.split(";")[0] as string;

	const list = (await (
		await apiGet("/api/v1/report-templates", cookie)
	).json()) as Array<{ name: string }>;
	// Names come from the ja catalog (order is not guaranteed — the rows share a
	// createdAt), so compare as sets.
	expect(list.map((t) => t.name).sort()).toEqual(
		catalogTemplatesForLocale("ja")
			.map((t) => t.name)
			.sort(),
	);
});

it("does not re-seed the starter catalog once an instance is emptied", async () => {
	// Seeding happens once, at bootstrap signup — not on list reads. An instance
	// later emptied of templates (its default is delete-protected via the API, so
	// this is simulated out-of-band) stays empty until a template is created.
	const admin = await signUpUser("Admin", "admin@example.com");

	const seeded = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as Array<{ id: string }>;
	expect(seeded.length).toBe(3);

	await env.DB.prepare("DELETE FROM report_templates").run();

	// A later read finds the table empty and does not re-seed.
	const again = (await (
		await apiGet("/api/v1/report-templates", admin)
	).json()) as unknown[];
	expect(again).toEqual([]);
});

it("lets any authenticated user read templates but not anonymous callers", async () => {
	const { admin, member } = await setup();
	await apiJson("POST", "/api/v1/report-templates", templateInput, admin);

	// Templates are instance-wide formats: every member can read the list. The
	// instance already has the bootstrap-seeded catalog plus the admin's custom
	// template; the member sees them all.
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
	// The no-default state the POST fallback covers: an instance predating
	// bootstrap seeding, or one later emptied of templates. Bootstrap seeds the
	// catalog, so empty it out-of-band to reach that state.
	const admin = await signUpUser("Admin", "admin@example.com");
	await env.DB.prepare("DELETE FROM report_templates").run();

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
	expect(seeded.length).toBe(3);
	expect(seeded.filter((t) => t.isDefault)).toHaveLength(1);
	const id = seeded.find((t) => t.isDefault)?.id as string;

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
	).json()) as Array<{ id: string; isDefault: boolean }>;
	const original = seeded.find((t) => t.isDefault)?.id as string;
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
