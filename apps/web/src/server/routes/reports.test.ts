import { todayInTimezone } from "@toxil/core";
import { expect, it } from "vitest";

import { apiGet, apiJson, signUpUser } from "../../../test/helpers";

async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const other = await signUpUser("Other", "other@example.com");
	const ws = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
			admin,
		)
	).json()) as { id: string };
	const project = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "toxil", name: "Toxil" },
			admin,
		)
	).json()) as { id: string };
	return { admin, other, ws, project };
}

async function createEntry(
	cookie: string,
	ws: string,
	project: string,
	description: string,
	tags: string[],
	entryDate?: string,
) {
	const res = await apiJson(
		"POST",
		"/api/v1/work-entries",
		{
			workspaceId: ws,
			projectId: project,
			durationMinutes: 30,
			description,
			tags,
			...(entryDate ? { entryDate } : {}),
		},
		cookie,
	);
	expect(res.status).toBe(201);
}

const baseReport = (wsId: string) => ({
	name: "Daily standup",
	templateId: "builtin:daily",
	filters: { workspaceIds: [wsId], tags: ["api"], dateRange: "today" },
	note: "Reviewed by QA",
});

it("creates, lists, updates, and deletes own reports only", async () => {
	const { admin, other, ws } = await setup();

	const created = await apiJson(
		"POST",
		"/api/v1/reports",
		baseReport(ws.id),
		admin,
	);
	expect(created.status).toBe(201);
	const report = (await created.json()) as {
		id: string;
		note: string;
		renderedMarkdown: string;
		filters: { dateRange: { from: string; to: string } };
	};
	expect(report.note).toBe("Reviewed by QA");
	// Create renders inline; the period is stored as absolute dates.
	expect(report.renderedMarkdown).toContain("Reviewed by QA");
	const today = todayInTimezone("Asia/Tokyo");
	expect(report.filters.dateRange).toEqual({ from: today, to: today });

	// The list payload is metadata only — no rendered body.
	const list = (await (await apiGet("/api/v1/reports", admin)).json()) as Array<
		Record<string, unknown>
	>;
	expect(list.map((r) => r.id)).toEqual([report.id]);
	expect(list[0]).not.toHaveProperty("renderedMarkdown");
	expect(await (await apiGet("/api/v1/reports", other)).json()).toEqual([]);

	// The full report (with markdown) is fetched on demand.
	const full = await apiGet(`/api/v1/reports/${report.id}`, admin);
	expect(full.status).toBe(200);
	expect(
		((await full.json()) as { renderedMarkdown: string }).renderedMarkdown,
	).toContain("Reviewed by QA");

	// Other users get 404, not 403: existence stays hidden.
	expect((await apiGet(`/api/v1/reports/${report.id}`, other)).status).toBe(
		404,
	);
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/reports/${report.id}`,
				{ name: "Hijack" },
				other,
			)
		).status,
	).toBe(404);

	// Editing re-renders; a blank note collapses to null.
	const updated = await apiJson(
		"PATCH",
		`/api/v1/reports/${report.id}`,
		{ name: "Renamed", note: "   " },
		admin,
	);
	expect(updated.status).toBe(200);
	const patched = (await updated.json()) as {
		name: string;
		note: null;
		renderedMarkdown: string;
	};
	expect(patched.name).toBe("Renamed");
	expect(patched.note).toBeNull();
	expect(patched.renderedMarkdown).not.toContain("Reviewed by QA");

	expect(
		(await apiJson("DELETE", `/api/v1/reports/${report.id}`, undefined, admin))
			.status,
	).toBe(204);
	expect((await apiGet(`/api/v1/reports/${report.id}`, admin)).status).toBe(
		404,
	);
});

it("renders entries inline, scoped by tags and date", async () => {
	const { admin, ws, project } = await setup();
	await createEntry(admin, ws.id, project.id, "Wired the endpoint", ["api"]);
	await createEntry(admin, ws.id, project.id, "Tidied the desk", ["chore"]);

	const report = (await (
		await apiJson("POST", "/api/v1/reports", baseReport(ws.id), admin)
	).json()) as { renderedMarkdown: string; totalMinutes: number };
	expect(report.renderedMarkdown).toContain("Wired the endpoint");
	expect(report.renderedMarkdown).not.toContain("Tidied the desk");
	// Only the tag-matching entry counts toward the persisted total.
	expect(report.totalMinutes).toBe(30);

	// The total is metadata, so it rides along on the list payload too.
	const list = (await (
		await apiGet("/api/v1/reports", admin)
	).json()) as Array<{
		totalMinutes: number;
	}>;
	expect(list[0]?.totalMinutes).toBe(30);
});

it("stores a custom absolute period and renders that window", async () => {
	const { admin, ws, project } = await setup();
	await createEntry(
		admin,
		ws.id,
		project.id,
		"Backfilled work",
		["api"],
		"2026-01-15",
	);

	const created = await apiJson(
		"POST",
		"/api/v1/reports",
		{
			...baseReport(ws.id),
			filters: {
				workspaceIds: [ws.id],
				tags: ["api"],
				dateRange: { from: "2026-01-01", to: "2026-01-31" },
			},
		},
		admin,
	);
	expect(created.status).toBe(201);
	const report = (await created.json()) as {
		renderedMarkdown: string;
		filters: { dateRange: { from: string; to: string } };
	};
	expect(report.renderedMarkdown).toContain("Backfilled work");
	expect(report.filters.dateRange).toEqual({
		from: "2026-01-01",
		to: "2026-01-31",
	});
});

it("passes the preset to templates only when one was chosen", async () => {
	const { admin, ws } = await setup();
	const template = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/report-templates`,
			{ name: "Preset probe", body: "[{{ period.preset }}]{{ period.from }}" },
			admin,
		)
	).json()) as { id: string };

	const preset = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{ ...baseReport(ws.id), templateId: template.id },
			admin,
		)
	).json()) as { renderedMarkdown: string };
	expect(preset.renderedMarkdown).toContain("[today]");

	const absolute = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				...baseReport(ws.id),
				templateId: template.id,
				filters: {
					workspaceIds: [ws.id],
					dateRange: { from: "2026-02-01", to: "2026-02-28" },
				},
			},
			admin,
		)
	).json()) as { renderedMarkdown: string };
	expect(absolute.renderedMarkdown).toBe("[]2026-02-01");
});

it("rejects filters outside the caller's workspace memberships", async () => {
	const { admin, other, ws } = await setup();

	const direct = await apiJson(
		"POST",
		"/api/v1/reports",
		baseReport(ws.id),
		other,
	);
	expect(direct.status).toBe(403);
	expect(
		((await direct.json()) as { error: { code: string } }).error.code,
	).toBe("forbidden");

	const ghost = await apiJson(
		"POST",
		"/api/v1/reports",
		baseReport(crypto.randomUUID()),
		admin,
	);
	expect(ghost.status).toBe(403);
});

it("hides workspace templates outside the caller's memberships", async () => {
	const { admin, other, ws } = await setup();
	const template = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/report-templates`,
			{ name: "T", body: "{{ report.name }}" },
			admin,
		)
	).json()) as { id: string };

	const res = await apiJson(
		"POST",
		"/api/v1/reports",
		{
			name: "R",
			templateId: template.id,
			filters: { workspaceIds: [ws.id], dateRange: "today" },
		},
		other,
	);
	// Membership check fires first (403); a template-only leak would be 404.
	expect([403, 404]).toContain(res.status);

	const unknownTemplate = await apiJson(
		"POST",
		"/api/v1/reports",
		{ ...baseReport(ws.id), templateId: crypto.randomUUID() },
		admin,
	);
	expect(unknownTemplate.status).toBe(404);
});

it("requires a custom template to belong to a filtered workspace", async () => {
	const { admin, ws } = await setup();
	const otherWs = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "labs", name: "Labs", timezone: "UTC" },
			admin,
		)
	).json()) as { id: string };
	const template = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${otherWs.id}/report-templates`,
			{ name: "Labs only", body: "{{ report.name }}" },
			admin,
		)
	).json()) as { id: string };

	const res = await apiJson(
		"POST",
		"/api/v1/reports",
		{ ...baseReport(ws.id), templateId: template.id },
		admin,
	);
	expect(res.status).toBe(400);
	expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
		"bad_request",
	);

	const ok = await apiJson(
		"POST",
		"/api/v1/reports",
		{
			...baseReport(ws.id),
			templateId: template.id,
			filters: { workspaceIds: [ws.id, otherWs.id], dateRange: "today" },
		},
		admin,
	);
	expect(ok.status).toBe(201);
});

it("rejects malformed or oversized date ranges at create", async () => {
	const { admin, ws } = await setup();

	for (const dateRange of [
		{ from: "2026-02-01", to: "2026-01-31" }, // from > to
		{ from: "not-a-date", to: "2026-01-31" },
		{ from: "2024-01-01", to: "2025-06-01" }, // span > 366 days
	]) {
		const res = await apiJson(
			"POST",
			"/api/v1/reports",
			{ ...baseReport(ws.id), filters: { workspaceIds: [ws.id], dateRange } },
			admin,
		);
		expect(res.status).toBe(400);
	}
});

it("revokes report content access when workspace membership is lost", async () => {
	const { admin, other, ws } = await setup();
	await apiJson(
		"POST",
		`/api/v1/workspaces/${ws.id}/members`,
		{ email: "other@example.com" },
		admin,
	);
	const report = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{
				name: "Mine",
				templateId: "builtin:daily",
				filters: { workspaceIds: [ws.id], dateRange: "today" },
			},
			other,
		)
	).json()) as { id: string };
	expect((await apiGet(`/api/v1/reports/${report.id}`, other)).status).toBe(
		200,
	);

	const me = (await (await apiGet("/api/v1/me", other)).json()) as {
		user: { id: string };
	};
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/workspaces/${ws.id}/members/${me.user.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);

	// Reading the rendered content and re-rendering both need membership.
	expect((await apiGet(`/api/v1/reports/${report.id}`, other)).status).toBe(
		403,
	);
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/reports/${report.id}`,
				{ name: "Edited" },
				other,
			)
		).status,
	).toBe(403);
	// The owner can still delete their own report (no data exposure).
	expect(
		(await apiJson("DELETE", `/api/v1/reports/${report.id}`, undefined, other))
			.status,
	).toBe(204);
});

it("rejects report writes that use a disabled template", async () => {
	const { admin, ws } = await setup();
	const template = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/report-templates`,
			{ name: "Active", body: "{{ report.name }}" },
			admin,
		)
	).json()) as { id: string };
	const report = (await (
		await apiJson(
			"POST",
			"/api/v1/reports",
			{ ...baseReport(ws.id), templateId: template.id },
			admin,
		)
	).json()) as { id: string };

	// Disable the custom template; existing reports become read-only.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/workspaces/${ws.id}/report-templates/${template.id}/state`,
				{ enabled: false },
				admin,
			)
		).status,
	).toBe(200);
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/reports/${report.id}`,
				{ name: "Edited" },
				admin,
			)
		).status,
	).toBe(400);
	expect(
		(
			await apiJson(
				"POST",
				"/api/v1/reports",
				{ ...baseReport(ws.id), templateId: template.id },
				admin,
			)
		).status,
	).toBe(400);

	// Builtins respect the per-workspace settings override too.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/workspaces/${ws.id}/report-templates/builtin:daily/state`,
				{ enabled: false },
				admin,
			)
		).status,
	).toBe(200);
	expect(
		(await apiJson("POST", "/api/v1/reports", baseReport(ws.id), admin)).status,
	).toBe(400);
});

it("surfaces template rendering errors as bad_request and saves nothing", async () => {
	const { admin, ws } = await setup();
	const template = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/report-templates`,
			{ name: "Evil", body: "{% include 'secrets' %}" },
			admin,
		)
	).json()) as { id: string };

	const res = await apiJson(
		"POST",
		"/api/v1/reports",
		{ ...baseReport(ws.id), templateId: template.id },
		admin,
	);
	expect(res.status).toBe(400);
	const body = (await res.json()) as { error: { message: string } };
	expect(body.error.message).toContain("Template rendering failed");

	// Nothing was persisted.
	expect(await (await apiGet("/api/v1/reports", admin)).json()).toEqual([]);
});
