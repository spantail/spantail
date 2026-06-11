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
		},
		cookie,
	);
	expect(res.status).toBe(201);
}

const baseReport = (wsId: string) => ({
	name: "Daily standup",
	templateId: "builtin:daily",
	scope: { workspaceIds: [wsId], tags: ["api"], dateRange: "today" },
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
	const report = (await created.json()) as { id: string; note: string };
	expect(report.note).toBe("Reviewed by QA");

	const list = (await (
		await apiGet("/api/v1/reports", admin)
	).json()) as Array<{ id: string }>;
	expect(list.map((r) => r.id)).toEqual([report.id]);
	expect(await (await apiGet("/api/v1/reports", other)).json()).toEqual([]);

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

	const updated = await apiJson(
		"PATCH",
		`/api/v1/reports/${report.id}`,
		{ name: "Renamed", note: "   " },
		admin,
	);
	expect(updated.status).toBe(200);
	const patched = (await updated.json()) as { name: string; note: null };
	expect(patched.name).toBe("Renamed");
	expect(patched.note).toBeNull();

	expect(
		(await apiJson("DELETE", `/api/v1/reports/${report.id}`, undefined, admin))
			.status,
	).toBe(204);
	expect((await apiGet(`/api/v1/reports/${report.id}`, admin)).status).toBe(
		404,
	);
});

it("rejects scopes outside the caller's workspace memberships", async () => {
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
			scope: { workspaceIds: [ws.id], dateRange: "today" },
		},
		other,
	);
	// Scope check fires first (403); a template-only leak would be 404 anyway.
	expect([403, 404]).toContain(res.status);

	const unknownTemplate = await apiJson(
		"POST",
		"/api/v1/reports",
		{ ...baseReport(ws.id), templateId: crypto.randomUUID() },
		admin,
	);
	expect(unknownTemplate.status).toBe(404);
});

it("runs a report into an immutable snapshot", async () => {
	const { admin, ws, project } = await setup();
	await createEntry(admin, ws.id, project.id, "Wired the run endpoint", [
		"api",
	]);
	await createEntry(admin, ws.id, project.id, "Tidied the desk", ["chore"]);

	const report = (await (
		await apiJson("POST", "/api/v1/reports", baseReport(ws.id), admin)
	).json()) as { id: string };

	const run = await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/run`,
		undefined,
		admin,
	);
	expect(run.status).toBe(201);
	const snapshot = (await run.json()) as {
		id: string;
		renderedMarkdown: string;
		resolvedScope: { dateRange: { from: string; to: string } };
	};
	expect(snapshot.renderedMarkdown).toContain("Wired the run endpoint");
	expect(snapshot.renderedMarkdown).not.toContain("Tidied the desk");
	expect(snapshot.renderedMarkdown).toContain("Reviewed by QA");
	const today = todayInTimezone("Asia/Tokyo");
	expect(snapshot.resolvedScope.dateRange).toEqual({ from: today, to: today });

	const metaList = (await (
		await apiGet(`/api/v1/reports/${report.id}/snapshots`, admin)
	).json()) as Array<Record<string, unknown>>;
	expect(metaList).toHaveLength(1);
	expect(metaList[0]?.id).toBe(snapshot.id);
	expect(metaList[0]).not.toHaveProperty("renderedMarkdown");

	const full = await apiGet(`/api/v1/report-snapshots/${snapshot.id}`, admin);
	expect(full.status).toBe(200);
	expect(
		((await full.json()) as { renderedMarkdown: string }).renderedMarkdown,
	).toContain("Wired the run endpoint");
});

it("guards snapshots by report ownership and supports delete", async () => {
	const { admin, other, ws, project } = await setup();
	await createEntry(admin, ws.id, project.id, "Entry", ["api"]);
	const report = (await (
		await apiJson("POST", "/api/v1/reports", baseReport(ws.id), admin)
	).json()) as { id: string };
	const snapshot = (await (
		await apiJson("POST", `/api/v1/reports/${report.id}/run`, undefined, admin)
	).json()) as { id: string };

	expect(
		(await apiGet(`/api/v1/report-snapshots/${snapshot.id}`, other)).status,
	).toBe(404);
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/report-snapshots/${snapshot.id}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);
	expect(
		(await apiGet(`/api/v1/report-snapshots/${snapshot.id}`, admin)).status,
	).toBe(404);
});

it("revokes snapshot content access when workspace membership is lost", async () => {
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
				scope: { workspaceIds: [ws.id], dateRange: "today" },
			},
			other,
		)
	).json()) as { id: string };
	const snapshot = (await (
		await apiJson("POST", `/api/v1/reports/${report.id}/run`, undefined, other)
	).json()) as { id: string };
	expect(
		(await apiGet(`/api/v1/report-snapshots/${snapshot.id}`, other)).status,
	).toBe(200);

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

	// Rendered content is gone with the membership; re-running is blocked too.
	const denied = await apiGet(`/api/v1/report-snapshots/${snapshot.id}`, other);
	expect(denied.status).toBe(403);
	expect(
		(
			await apiJson(
				"POST",
				`/api/v1/reports/${report.id}/run`,
				undefined,
				other,
			)
		).status,
	).toBe(403);
	// The owner can still delete their own snapshot (no data exposure).
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/report-snapshots/${snapshot.id}`,
				undefined,
				other,
			)
		).status,
	).toBe(204);
});

it("surfaces template rendering errors as bad_request", async () => {
	const { admin, ws } = await setup();
	const template = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/report-templates`,
			{ name: "Evil", body: "{% include 'secrets' %}" },
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

	const run = await apiJson(
		"POST",
		`/api/v1/reports/${report.id}/run`,
		undefined,
		admin,
	);
	expect(run.status).toBe(400);
	const body = (await run.json()) as { error: { message: string } };
	expect(body.error.message).toContain("Template rendering failed");
});
