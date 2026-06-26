import { splitFrontMatter, todayInTimezone } from "@spantail/core";
import { expect, it } from "vitest";

import {
	apiGet,
	apiJson,
	defaultTemplateId,
	signUpUser,
} from "../../../test/helpers";

// The default template seeded for the bootstrap admin; baseReport renders with
// it. Set by setup() (a file's tests run sequentially, so this stays coherent).
let seededTemplateId = "";

async function setup() {
	const admin = await signUpUser("Admin", "admin@example.com");
	const other = await signUpUser("Other", "other@example.com");
	seededTemplateId = await defaultTemplateId(admin);
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
			{ slug: "spantail", name: "Spantail" },
			admin,
		)
	).json()) as { id: string };
	return { admin, other, ws, project, templateId: seededTemplateId };
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
	templateId: seededTemplateId,
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
		version: number;
		renderedMarkdown: string;
		filters: { dateRange: { from: string; to: string } };
	};
	expect(report.note).toBe("Reviewed by QA");
	// Create renders inline at version 1; the period is stored as absolute dates.
	expect(report.version).toBe(1);
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

	// Editing changes fields and re-renders, appending the next version.
	const updated = await apiJson(
		"PATCH",
		`/api/v1/reports/${report.id}`,
		{ ...baseReport(ws.id), name: "Renamed", note: "Re-reviewed" },
		admin,
	);
	expect(updated.status).toBe(200);
	const patched = (await updated.json()) as {
		name: string;
		note: string | null;
		version: number;
		renderedMarkdown: string;
	};
	expect(patched.name).toBe("Renamed");
	expect(patched.version).toBe(2);
	// Re-rendered from the new fields: the name is the document's H1, note applied.
	expect(patched.renderedMarkdown).toContain("Renamed");
	expect(patched.renderedMarkdown).toContain("Re-reviewed");
	expect(patched.note).toBe("Re-reviewed");

	expect(
		(await apiJson("DELETE", `/api/v1/reports/${report.id}`, undefined, admin))
			.status,
	).toBe(204);
	expect((await apiGet(`/api/v1/reports/${report.id}`, admin)).status).toBe(
		404,
	);
});

it("re-renders on edit, bumping the version and picking up field changes", async () => {
	const { admin, ws, project } = await setup();
	await createEntry(admin, ws.id, project.id, "Wired the endpoint", ["api"]);
	const report = (await (
		await apiJson("POST", "/api/v1/reports", baseReport(ws.id), admin)
	).json()) as { id: string; totalMinutes: number; version: number };
	expect(report.totalMinutes).toBe(30);
	expect(report.version).toBe(1);

	// Log more matching work, then edit: the new version re-renders from source,
	// and provenance (template, totals) follows the new fields.
	await createEntry(admin, ws.id, project.id, "More API work", ["api"]);
	const otherTemplate = (await (
		await apiJson(
			"POST",
			"/api/v1/report-templates",
			{
				name: "Weekly",
				body: "# {{ report.name }}\n{% for e in entries %}- {{ e.description }}\n{% endfor %}",
			},
			admin,
		)
	).json()) as { id: string };
	const res = await apiJson(
		"PATCH",
		`/api/v1/reports/${report.id}`,
		{ ...baseReport(ws.id), templateId: otherTemplate.id },
		admin,
	);
	expect(res.status).toBe(200);
	const patched = (await res.json()) as {
		templateId: string;
		totalMinutes: number;
		version: number;
		renderedMarkdown: string;
	};
	expect(patched.version).toBe(2);
	expect(patched.templateId).toBe(otherTemplate.id);
	// The re-render reflects current entries and the new template.
	expect(patched.totalMinutes).toBe(60);
	expect(patched.renderedMarkdown).toContain("More API work");
});

it("previews a report without persisting it", async () => {
	const { admin, ws, project } = await setup();
	await createEntry(admin, ws.id, project.id, "Wired the endpoint", ["api"]);

	const res = await apiJson(
		"POST",
		"/api/v1/reports/preview",
		baseReport(ws.id),
		admin,
	);
	expect(res.status).toBe(200);
	const preview = (await res.json()) as {
		content: string;
		totalMinutes: number;
		entryCount: number;
		projectCount: number;
	};
	expect(preview.totalMinutes).toBe(30);
	expect(preview.entryCount).toBe(1);
	expect(preview.projectCount).toBe(1);
	// The content carries the system front-matter header; the body renders entries.
	expect(splitFrontMatter(preview.content).frontMatter).not.toBeNull();
	expect(preview.content).toContain("Wired the endpoint");

	// Nothing was persisted by a preview.
	expect(await (await apiGet("/api/v1/reports", admin)).json()).toEqual([]);
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

it("redacts totalMinutes once the report owner loses workspace membership", async () => {
	const { admin, ws, project } = await setup();
	await createEntry(admin, ws.id, project.id, "Wired the endpoint", ["api"]);

	// Bob joins, owns a report scoped to the workspace, then is removed.
	const bob = await signUpUser("Bob", "bob@example.com");
	const membership = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/members`,
			{ email: "bob@example.com", role: "member" },
			admin,
		)
	).json()) as { userId: string };
	// Bob joins the project so his report can see its entries (project ACL).
	await apiJson(
		"POST",
		`/api/v1/projects/${project.id}/members`,
		{ userId: membership.userId },
		admin,
	);

	const report = (await (
		await apiJson("POST", "/api/v1/reports", baseReport(ws.id), bob)
	).json()) as { id: string; totalMinutes: number };
	expect(report.totalMinutes).toBe(30);

	// While Bob is still a member, the list keeps the aggregate.
	let list = (await (await apiGet("/api/v1/reports", bob)).json()) as Array<{
		id: string;
		totalMinutes: number | null;
	}>;
	expect(list[0]?.totalMinutes).toBe(30);

	// After removal Bob still owns the report, but the workspace aggregate is
	// redacted — mirroring the membership gate on the full report body.
	expect(
		(
			await apiJson(
				"DELETE",
				`/api/v1/workspaces/${ws.id}/members/${membership.userId}`,
				undefined,
				admin,
			)
		).status,
	).toBe(204);
	list = (await (await apiGet("/api/v1/reports", bob)).json()) as Array<{
		id: string;
		totalMinutes: number | null;
	}>;
	expect(list.map((r) => r.id)).toEqual([report.id]);
	expect(list[0]?.totalMinutes).toBeNull();
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
			"/api/v1/report-templates",
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
	// The body sits below the system front-matter header.
	expect(splitFrontMatter(absolute.renderedMarkdown).body).toBe("[]2026-02-01");
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

it("rejects reports outside the caller's memberships or with an unknown template", async () => {
	const { admin, other, ws } = await setup();
	const template = (await (
		await apiJson(
			"POST",
			"/api/v1/report-templates",
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
	// The scope includes a workspace the caller isn't a member of.
	expect(res.status).toBe(403);

	const unknownTemplate = await apiJson(
		"POST",
		"/api/v1/reports",
		{ ...baseReport(ws.id), templateId: crypto.randomUUID() },
		admin,
	);
	expect(unknownTemplate.status).toBe(404);
});

it("applies a custom template to any scope (templates are instance-scoped)", async () => {
	const { admin, ws } = await setup();
	const otherWs = (await (
		await apiJson(
			"POST",
			"/api/v1/workspaces",
			{ slug: "labs", name: "Labs", timezone: "UTC" },
			admin,
		)
	).json()) as { id: string };
	// One instance-wide template, created without any workspace context.
	const template = (await (
		await apiJson(
			"POST",
			"/api/v1/report-templates",
			{ name: "Shared", body: "{{ report.name }}" },
			admin,
		)
	).json()) as { id: string };

	// The same template backs reports for either workspace, with no requirement
	// that the template "belong to" a filtered workspace.
	const forAcme = await apiJson(
		"POST",
		"/api/v1/reports",
		{ ...baseReport(ws.id), templateId: template.id },
		admin,
	);
	expect(forAcme.status).toBe(201);

	const forLabs = await apiJson(
		"POST",
		"/api/v1/reports",
		{
			...baseReport(otherWs.id),
			templateId: template.id,
			filters: { workspaceIds: [otherWs.id], dateRange: "today" },
		},
		admin,
	);
	expect(forLabs.status).toBe(201);
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
				templateId: seededTemplateId,
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

it("rejects creating a report with a disabled template", async () => {
	const { admin, ws } = await setup();
	const template = (await (
		await apiJson(
			"POST",
			"/api/v1/report-templates",
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

	// Disable the custom template. Editing re-renders through the template, so a
	// disabled template blocks edits too (the report stays viewable/shareable).
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/report-templates/${template.id}/state`,
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
				{ ...baseReport(ws.id), templateId: template.id, name: "Edited" },
				admin,
			)
		).status,
	).toBe(400);
	// And a disabled template can no longer back a new report.
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

	// The seeded default template respects the same rule.
	expect(
		(
			await apiJson(
				"PATCH",
				`/api/v1/report-templates/${seededTemplateId}/state`,
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
			"/api/v1/report-templates",
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

it("filters and paginates the report list server-side", async () => {
	const { admin, ws, project } = await setup();
	const project2 = (await (
		await apiJson(
			"POST",
			`/api/v1/workspaces/${ws.id}/projects`,
			{ slug: "two", name: "Two" },
			admin,
		)
	).json()) as { id: string };
	const create = (
		name: string,
		dateRange: { from: string; to: string },
		projectIds?: string[],
	) =>
		apiJson(
			"POST",
			"/api/v1/reports",
			{
				name,
				templateId: seededTemplateId,
				filters: {
					workspaceIds: [ws.id],
					...(projectIds ? { projectIds } : {}),
					dateRange,
				},
			},
			admin,
		);
	expect(
		(await create("Jan", { from: "2025-01-01", to: "2025-01-31" })).status,
	).toBe(201);
	expect(
		(
			await create("Feb", { from: "2025-02-01", to: "2025-02-28" }, [
				project.id,
			])
		).status,
	).toBe(201);
	expect(
		(await create("Mar", { from: "2025-03-01", to: "2025-03-31" })).status,
	).toBe(201);
	expect(
		(
			await create("Apr", { from: "2025-04-01", to: "2025-04-30" }, [
				project2.id,
			])
		).status,
	).toBe(201);

	const fetchList = async (qs: string) =>
		(await (await apiGet(`/api/v1/reports${qs}`, admin)).json()) as Array<{
			id: string;
			name: string;
		}>;
	const names = async (qs: string) =>
		(await fetchList(qs)).map((r) => r.name).sort();

	// Pagination is stable (a total order), so pages are disjoint and complete —
	// without asserting the order, which createdAt ties may resolve by id.
	const page1 = (await fetchList("?limit=2")).map((r) => r.id);
	const page2 = (await fetchList("?limit=2&offset=2")).map((r) => r.id);
	expect(page1).toHaveLength(2);
	expect(page2).toHaveLength(2);
	expect(new Set([...page1, ...page2]).size).toBe(4);

	// Period overlap with the report's stored range.
	expect(await names("?from=2025-02-15")).toEqual(["Apr", "Feb", "Mar"]);
	expect(await names("?to=2025-01-15")).toEqual(["Jan"]);

	// Project filter: explicit-projectIds reports match only their projects; an
	// all-projects report (Jan, Mar) matches any project in its workspaces.
	expect(await names(`?projectId=${project.id}`)).toEqual([
		"Feb",
		"Jan",
		"Mar",
	]);
	expect(await names(`?projectId=${project2.id}`)).toEqual([
		"Apr",
		"Jan",
		"Mar",
	]);

	// templateId is the tab filter; an unused template returns nothing.
	expect(await names(`?templateId=${crypto.randomUUID()}`)).toEqual([]);
	expect(await names(`?templateId=${seededTemplateId}`)).toEqual([
		"Apr",
		"Feb",
		"Jan",
		"Mar",
	]);
});

it("lists distinct template ids in use", async () => {
	const { admin, ws } = await setup();
	expect(
		await (await apiGet("/api/v1/reports/template-ids", admin)).json(),
	).toEqual([]);
	await apiJson("POST", "/api/v1/reports", baseReport(ws.id), admin);
	expect(
		await (await apiGet("/api/v1/reports/template-ids", admin)).json(),
	).toEqual([seededTemplateId]);
});
