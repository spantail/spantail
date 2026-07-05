import type { Report } from "@spantail/core";
import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import {
	createTestContext,
	fakeApi,
	templateFixture,
	workspaceFixture,
} from "../test-helpers";

function reportFixture(overrides: Partial<Report> = {}): Report {
	return {
		id: "rep-1",
		name: "Weekly",
		ownerUserId: "u1",
		templateId: "tmpl-weekly",
		filters: {
			workspaceIds: ["ws-acme"],
			dateRange: { from: "2026-06-08", to: "2026-06-14" },
		},
		note: null,
		totalMinutes: 750,
		version: 1,
		reportContentId: "rep-1-v1",
		renderedMarkdown: "# Weekly report\n\n- did things\n",
		createdAt: "2026-06-01T00:00:00Z",
		updatedAt: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
	});
}

it("lists reports with full ids and ranges", async () => {
	const api = fakeApi([
		{
			path: "/reports",
			body: [
				reportFixture(),
				reportFixture({
					id: "rep-2",
					name: "June",
					filters: {
						workspaceIds: ["ws-acme"],
						dateRange: { from: "2026-06-01", to: "2026-06-30" },
					},
				}),
			],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "list"], ctx)).toBe(0);
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toMatch(/^ID\s+NAME\s+TEMPLATE\s+RANGE$/);
	expect(lines[1]).toContain("rep-1");
	expect(lines[1]).toContain("2026-06-08..2026-06-14");
	expect(lines[2]).toContain("2026-06-01..2026-06-30");
});

it("prints exactly the rendered markdown on stdout", async () => {
	const api = fakeApi([{ path: "/reports/rep-1", body: reportFixture() }]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: api.fetch,
	});
	loggedIn(configDir);

	expect(await runCli(["report", "view", "rep-1"], ctx)).toBe(0);
	expect(stdout.text()).toBe(reportFixture().renderedMarkdown);
	expect(stderr.text()).toBe("Report Weekly (2026-06-08 – 2026-06-14)\n");
});

it("appends a trailing newline when the markdown lacks one", async () => {
	const api = fakeApi([
		{
			path: "/reports/rep-1",
			body: reportFixture({ renderedMarkdown: "# No newline" }),
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "view", "rep-1"], ctx)).toBe(0);
	expect(stdout.text()).toBe("# No newline\n");
});

it("hints at report list for unknown ids", async () => {
	const api = fakeApi([]);
	const { ctx, stderr, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "view", "nope"], ctx)).toBe(1);
	expect(stderr.text()).toContain('report "nope" not found');
	expect(stderr.text()).toContain("spantail report list");
});

it("requires a single report id", async () => {
	for (const argv of [
		["report", "view"],
		["report", "view", "a", "b"],
	]) {
		const { ctx, stderr, configDir } = createTestContext();
		loggedIn(configDir);
		expect(await runCli(argv, ctx)).toBe(2);
		expect(stderr.text()).toContain("expected a single report <id>");
	}
});

const acme = workspaceFixture("acme");

function loggedInWithDefault(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
		defaultWorkspace: "acme",
	});
}

it("passes report list filters through as query params", async () => {
	const api = fakeApi([{ path: "/reports", body: [] }]);
	const { ctx, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	await runCli(
		[
			"report",
			"list",
			"--template",
			"tpl-1",
			"--from",
			"2026-06-01",
			"--to",
			"2026-06-30",
			"--limit",
			"5",
		],
		ctx,
	);
	const query = api.calls.find((call) => call.url.pathname.endsWith("/reports"))
		?.url.searchParams;
	expect(query?.get("templateId")).toBe("tpl-1");
	expect(query?.get("from")).toBe("2026-06-01");
	expect(query?.get("to")).toBe("2026-06-30");
	expect(query?.get("limit")).toBe("5");
});

it("lists templates with default and range columns", async () => {
	const api = fakeApi([
		{
			path: "/report-templates",
			body: [
				templateFixture({ defaultDateRange: "last_week" }),
				templateFixture({
					id: "tpl-2",
					name: "Monthly",
					isDefault: false,
					enabled: false,
				}),
			],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "templates"], ctx)).toBe(0);
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toMatch(/^ID\s+NAME\s+DEFAULT\s+ENABLED\s+RANGE/);
	expect(lines[1]).toContain("last-week");
	expect(lines[1]).toContain("yes");
	expect(lines[2]).toContain("Monthly");
});

it("creates a report adopting the suggested name", async () => {
	const api = fakeApi([
		{ path: "/report-templates", body: [templateFixture()] },
		{ path: "/workspaces", body: [acme] },
		{
			method: "POST",
			path: "/reports/preview",
			body: {
				content: "# Preview\n",
				totalMinutes: 60,
				entryCount: 1,
				projectCount: 1,
				suggestedName: "Weekly 2026-06-08",
				suggestedNote: "",
			},
		},
		{
			method: "POST",
			path: "/reports",
			body: reportFixture({ name: "Weekly 2026-06-08" }),
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedInWithDefault(configDir);

	expect(
		await runCli(
			["report", "create", "--template", "tpl-1", "--range", "last-week"],
			ctx,
		),
	).toBe(0);
	const post = api.calls.find(
		(call) => call.method === "POST" && call.url.pathname.endsWith("/reports"),
	);
	expect(post?.body).toEqual({
		name: "Weekly 2026-06-08",
		templateId: "tpl-1",
		filters: { workspaceIds: [acme.id], dateRange: "last_week" },
	});
	expect(stdout.text()).toContain('Created report "Weekly 2026-06-08"');
	expect(stdout.text()).toContain("rep-1");
});

it("creates with an explicit name without previewing", async () => {
	const api = fakeApi([
		{
			path: "/report-templates",
			body: [templateFixture({ defaultDateRange: "last_30_days" })],
		},
		{ path: "/workspaces", body: [acme] },
		{ method: "POST", path: "/reports", body: reportFixture({ name: "June" }) },
	]);
	const { ctx, configDir } = createTestContext({ fetch: api.fetch });
	loggedInWithDefault(configDir);

	expect(
		await runCli(
			["report", "create", "--template", "tpl-1", "--name", "June"],
			ctx,
		),
	).toBe(0);
	expect(
		api.calls.some((call) => call.url.pathname.endsWith("/reports/preview")),
	).toBe(false);
	const post = api.calls.find(
		(call) => call.method === "POST" && call.url.pathname.endsWith("/reports"),
	);
	// No range flag: the template's default relative range applies.
	expect(post?.body).toMatchObject({
		name: "June",
		filters: { dateRange: "last_30_days" },
	});
});

it("adopts the suggested note even when the name is explicit", async () => {
	const api = fakeApi([
		{
			path: "/report-templates",
			body: [templateFixture({ noteTemplate: "{{ scope.period }}" })],
		},
		{ path: "/workspaces", body: [acme] },
		{
			method: "POST",
			path: "/reports/preview",
			body: {
				content: "# Preview\n",
				totalMinutes: 60,
				entryCount: 1,
				projectCount: 1,
				suggestedName: "Weekly 2026-06-08",
				suggestedNote: "Covers 2026-06-08 – 2026-06-14",
			},
		},
		{ method: "POST", path: "/reports", body: reportFixture({ name: "June" }) },
	]);
	const { ctx, configDir } = createTestContext({ fetch: api.fetch });
	loggedInWithDefault(configDir);

	expect(
		await runCli(
			["report", "create", "--template", "tpl-1", "--name", "June"],
			ctx,
		),
	).toBe(0);
	const post = api.calls.find(
		(call) => call.method === "POST" && call.url.pathname.endsWith("/reports"),
	);
	expect(post?.body).toMatchObject({
		name: "June",
		note: "Covers 2026-06-08 – 2026-06-14",
	});
});

it("rejects an unknown template with the available ids", async () => {
	const api = fakeApi([
		{ path: "/report-templates", body: [templateFixture()] },
	]);
	const { ctx, stderr, configDir } = createTestContext({ fetch: api.fetch });
	loggedInWithDefault(configDir);

	expect(await runCli(["report", "create", "--template", "nope"], ctx)).toBe(1);
	expect(stderr.text()).toContain('unknown template "nope" (available: tpl-1)');
});

it("previews to stdout with stats on stderr", async () => {
	const api = fakeApi([
		{ path: "/report-templates", body: [templateFixture()] },
		{ path: "/workspaces", body: [acme] },
		{
			method: "POST",
			path: "/reports/preview",
			body: {
				content: "# Preview body",
				totalMinutes: 90,
				entryCount: 3,
				projectCount: 1,
				suggestedName: "Weekly 2026-06-08",
				suggestedNote: "",
			},
		},
	]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: api.fetch,
	});
	loggedInWithDefault(configDir);

	expect(await runCli(["report", "preview", "--template", "tpl-1"], ctx)).toBe(
		0,
	);
	expect(stdout.text()).toBe("# Preview body\n");
	expect(stderr.text()).toBe(
		"3 entries, total 1h 30m, suggested name: Weekly 2026-06-08\n",
	);
	// The suggested name is adopted and the preview re-rendered with it, so the
	// output matches what `report create` would save.
	const previews = api.calls.filter((call) =>
		call.url.pathname.endsWith("/reports/preview"),
	);
	expect(previews.length).toBe(2);
	expect(previews[1]?.body).toMatchObject({ name: "Weekly 2026-06-08" });
});

it("falls back to the template name when nothing is suggested", async () => {
	const api = fakeApi([
		{ path: "/report-templates", body: [templateFixture()] },
		{ path: "/workspaces", body: [acme] },
		{
			method: "POST",
			path: "/reports/preview",
			body: {
				content: "# Preview body",
				totalMinutes: 90,
				entryCount: 3,
				projectCount: 1,
				suggestedName: "",
				suggestedNote: "",
			},
		},
	]);
	const { ctx, configDir } = createTestContext({ fetch: api.fetch });
	loggedInWithDefault(configDir);

	expect(await runCli(["report", "preview", "--template", "tpl-1"], ctx)).toBe(
		0,
	);
	// Same fallback as `report create`: the template's own name.
	const previews = api.calls.filter((call) =>
		call.url.pathname.endsWith("/reports/preview"),
	);
	expect(previews.length).toBe(2);
	expect(previews[1]?.body).toMatchObject({ name: "Weekly" });
});

it("previews once when name and note are explicit", async () => {
	const api = fakeApi([
		{ path: "/report-templates", body: [templateFixture()] },
		{ path: "/workspaces", body: [acme] },
		{
			method: "POST",
			path: "/reports/preview",
			body: {
				content: "# Preview body",
				totalMinutes: 90,
				entryCount: 3,
				projectCount: 1,
				suggestedName: "Weekly 2026-06-08",
				suggestedNote: "",
			},
		},
	]);
	const { ctx, configDir } = createTestContext({ fetch: api.fetch });
	loggedInWithDefault(configDir);

	expect(
		await runCli(
			[
				"report",
				"preview",
				"--template",
				"tpl-1",
				"--name",
				"Weekly 2026-06-08",
				"--note",
				"hand-written",
			],
			ctx,
		),
	).toBe(0);
	const previews = api.calls.filter((call) =>
		call.url.pathname.endsWith("/reports/preview"),
	);
	expect(previews.length).toBe(1);
});

it("edits by merging flags over the current report", async () => {
	const current = reportFixture({
		note: "keep me",
		filters: {
			workspaceIds: ["ws-acme"],
			tags: ["infra"],
			dateRange: { from: "2026-06-08", to: "2026-06-14" },
		},
	});
	const api = fakeApi([
		{ path: "/reports/rep-1", body: current },
		{
			method: "PATCH",
			path: "/reports/rep-1",
			body: reportFixture({ version: 2 }),
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(
		await runCli(["report", "edit", "rep-1", "--range", "this-month"], ctx),
	).toBe(0);
	const patch = api.calls.find((call) => call.method === "PATCH");
	expect(patch?.body).toEqual({
		name: current.name,
		templateId: current.templateId,
		filters: {
			workspaceIds: ["ws-acme"],
			tags: ["infra"],
			dateRange: "this_month",
		},
		note: "keep me",
	});
	expect(stdout.text()).toContain("version 2");
});

it("clears the note and tag filter on request", async () => {
	const current = reportFixture({
		note: "old note",
		filters: {
			workspaceIds: ["ws-acme"],
			tags: ["infra"],
			dateRange: { from: "2026-06-08", to: "2026-06-14" },
		},
	});
	const api = fakeApi([
		{ path: "/reports/rep-1", body: current },
		{ method: "PATCH", path: "/reports/rep-1", body: reportFixture() },
	]);
	const { ctx, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(
		await runCli(
			["report", "edit", "rep-1", "--clear-note", "--clear-tags"],
			ctx,
		),
	).toBe(0);
	const patch = api.calls.find((call) => call.method === "PATCH");
	expect(patch?.body).toEqual({
		name: current.name,
		templateId: current.templateId,
		filters: {
			workspaceIds: ["ws-acme"],
			dateRange: { from: "2026-06-08", to: "2026-06-14" },
		},
	});
});

it("rejects conflicting clear flags", async () => {
	const { ctx, stderr, configDir } = createTestContext();
	loggedIn(configDir);
	expect(
		await runCli(
			["report", "edit", "rep-1", "--tag", "x", "--clear-tags"],
			ctx,
		),
	).toBe(2);
	expect(stderr.text()).toContain(
		"--tag and --clear-tags are mutually exclusive",
	);
});

it("deletes a report after confirmation", async () => {
	const api = fakeApi([
		{ path: "/reports/rep-1", body: reportFixture() },
		{ method: "DELETE", path: "/reports/rep-1", body: {} },
	]);
	const { ctx, stdout, configDir } = createTestContext({
		fetch: api.fetch,
		answers: ["y"],
	});
	loggedIn(configDir);

	expect(await runCli(["report", "delete", "rep-1"], ctx)).toBe(0);
	expect(api.calls.some((call) => call.method === "DELETE")).toBe(true);
	expect(stdout.text()).toBe("Deleted report rep-1\n");
});

it("refuses to delete a report non-interactively without --yes", async () => {
	const api = fakeApi([{ path: "/reports/rep-1", body: reportFixture() }]);
	const { ctx, stderr, configDir } = createTestContext({
		fetch: api.fetch,
		interactive: false,
	});
	loggedIn(configDir);

	expect(await runCli(["report", "delete", "rep-1"], ctx)).toBe(1);
	expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);
	expect(stderr.text()).toContain("pass --yes");
});
