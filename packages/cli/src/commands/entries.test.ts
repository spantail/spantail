import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import {
	createTestContext,
	entryFixture,
	fakeApi,
	memberFixture,
	projectFixture,
	workspaceFixture,
} from "../test-helpers";

const acme = workspaceFixture("acme", "owner");
const apiProject = projectFixture("api", acme.id);

function api(entries: unknown[]) {
	return fakeApi([
		{ path: "/workspaces", body: [acme] },
		{ path: `/workspaces/${acme.id}/projects`, body: [apiProject] },
		{ path: "/work-entries", body: entries },
	]);
}

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
		defaultWorkspace: "acme",
	});
}

it("lists entries with project slugs and totals on stderr", async () => {
	const stub = api([
		entryFixture({
			entryDate: "2026-06-12",
			durationMinutes: 90,
			description: "Fixed the build",
			tags: ["ci", "infra"],
		}),
		entryFixture({
			id: "entry-2",
			entryDate: "2026-06-11",
			durationMinutes: 30,
			description: "a".repeat(80),
		}),
	]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: stub.fetch,
	});
	loggedIn(configDir);

	expect(await runCli(["entries", "list"], ctx)).toBe(0);
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toMatch(/^DATE\s+DURATION\s+PROJECT\s+DESCRIPTION\s+TAGS$/);
	expect(lines[1]).toContain("2026-06-12  1h 30m    api");
	expect(lines[1]).toContain("Fixed the build");
	expect(lines[1]).toContain("ci,infra");
	expect(lines[2]).toContain(`${"a".repeat(59)}…`);
	expect(stderr.text()).toBe("2 entries, total 2h\n");
});

it("sends the default limit and the flag filters", async () => {
	const stub = api([]);
	const { ctx, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	await runCli(
		[
			"entries",
			"list",
			"--project",
			"api",
			"--from",
			"2026-06-01",
			"--to",
			"2026-06-12",
		],
		ctx,
	);

	const query = stub.calls.find((call) =>
		call.url.pathname.endsWith("/work-entries"),
	)?.url.searchParams;
	expect(query?.get("workspaceId")).toBe(acme.id);
	expect(query?.get("projectId")).toBe(apiProject.id);
	expect(query?.get("from")).toBe("2026-06-01");
	expect(query?.get("to")).toBe("2026-06-12");
	expect(query?.get("limit")).toBe("20");
});

it("reports an empty result on stderr only", async () => {
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: api([]).fetch,
	});
	loggedIn(configDir);

	expect(await runCli(["entries", "list"], ctx)).toBe(0);
	expect(stdout.text()).toBe("");
	expect(stderr.text()).toBe("No entries found.\n");
});

it("views one entry with a resolved project slug", async () => {
	const stub = fakeApi([
		{
			path: "/work-entries/entry-1",
			body: entryFixture({ note: "Details", tags: ["ci"] }),
		},
		{ path: `/workspaces/${acme.id}/projects`, body: [apiProject] },
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	expect(await runCli(["entries", "view", "entry-1"], ctx)).toBe(0);
	const text = stdout.text();
	expect(text).toContain("ID           entry-1");
	expect(text).toContain("Project      api");
	expect(text).toContain("Note         Details");
	expect(text).toContain("Tags         ci");
});

it("maps a missing entry to a friendly error", async () => {
	const stub = fakeApi([]);
	const { ctx, stderr, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	expect(await runCli(["entries", "view", "nope"], ctx)).toBe(1);
	expect(stderr.text()).toContain('work entry "nope" not found');
});

it("edits only the passed fields", async () => {
	const stub = fakeApi([
		{
			method: "PATCH",
			path: "/work-entries/entry-1",
			body: entryFixture({ durationMinutes: 120 }),
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	expect(
		await runCli(
			["entries", "edit", "entry-1", "--duration", "2h", "--clear-note"],
			ctx,
		),
	).toBe(0);
	const patch = stub.calls.find((call) => call.method === "PATCH");
	expect(patch?.body).toEqual({ durationMinutes: 120, note: null });
	expect(stdout.text()).toContain("Updated entry entry-1");
});

it("resolves --project in the entry's workspace when editing", async () => {
	const stub = fakeApi([
		{ path: "/work-entries/entry-1", body: entryFixture() },
		{ path: "/workspaces", body: [acme] },
		{ path: `/workspaces/${acme.id}/projects`, body: [apiProject] },
		{
			method: "PATCH",
			path: "/work-entries/entry-1",
			body: entryFixture(),
		},
	]);
	const { ctx, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	expect(
		await runCli(["entries", "edit", "entry-1", "--project", "api"], ctx),
	).toBe(0);
	const patch = stub.calls.find((call) => call.method === "PATCH");
	expect(patch?.body).toEqual({ projectId: apiProject.id });
});

it("rejects an edit with nothing to update", async () => {
	const { ctx, stderr, configDir } = createTestContext({
		fetch: fakeApi([]).fetch,
	});
	loggedIn(configDir);

	expect(await runCli(["entries", "edit", "entry-1"], ctx)).toBe(2);
	expect(stderr.text()).toContain("nothing to update");
});

function deleteApi() {
	return fakeApi([
		{ path: "/work-entries/entry-1", body: entryFixture() },
		{ method: "DELETE", path: "/work-entries/entry-1", body: {} },
	]);
}

it("deletes with --yes without prompting", async () => {
	const stub = deleteApi();
	const { ctx, stdout, configDir } = createTestContext({
		fetch: stub.fetch,
		interactive: false,
	});
	loggedIn(configDir);

	expect(await runCli(["entries", "delete", "entry-1", "--yes"], ctx)).toBe(0);
	expect(stub.calls.some((call) => call.method === "DELETE")).toBe(true);
	expect(stdout.text()).toBe("Deleted entry entry-1\n");
});

it("asks for confirmation and honors a no", async () => {
	const stub = deleteApi();
	const { ctx, stderr, configDir } = createTestContext({
		fetch: stub.fetch,
		answers: ["n"],
	});
	loggedIn(configDir);

	expect(await runCli(["entries", "delete", "entry-1"], ctx)).toBe(1);
	expect(stub.calls.some((call) => call.method === "DELETE")).toBe(false);
	expect(stderr.text()).toContain("Cancelled.");
});

it("refuses to delete non-interactively without --yes", async () => {
	const stub = deleteApi();
	const { ctx, stderr, configDir } = createTestContext({
		fetch: stub.fetch,
		interactive: false,
	});
	loggedIn(configDir);

	expect(await runCli(["entries", "delete", "entry-1"], ctx)).toBe(1);
	expect(stub.calls.some((call) => call.method === "DELETE")).toBe(false);
	expect(stderr.text()).toContain("pass --yes");
});

it("shows stats tables with resolved names", async () => {
	const stub = fakeApi([
		{ path: "/workspaces", body: [acme] },
		{ path: `/workspaces/${acme.id}/projects`, body: [apiProject] },
		{ path: `/workspaces/${acme.id}/members`, body: [memberFixture()] },
		{
			path: "/work-entries/stats",
			body: {
				totalMinutes: 150,
				entryCount: 2,
				byDate: [{ date: "2026-06-12", minutes: 150, count: 2 }],
				byProject: [{ projectId: apiProject.id, minutes: 150, count: 2 }],
				byUser: [{ userId: "u1", minutes: 150, count: 2 }],
			},
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	expect(await runCli(["entries", "stats"], ctx)).toBe(0);
	const text = stdout.text();
	expect(text).toContain("Total 2h 30m across 2 entries");
	expect(text).toContain("BY DATE");
	expect(text).toContain("api");
	expect(text).toContain("Alice");
});

it("passes stats filters and resolves the user email", async () => {
	const stub = fakeApi([
		{ path: "/workspaces", body: [acme] },
		{ path: `/workspaces/${acme.id}/projects`, body: [apiProject] },
		{ path: `/workspaces/${acme.id}/members`, body: [memberFixture()] },
		{
			path: "/work-entries/stats",
			body: {
				totalMinutes: 0,
				entryCount: 0,
				byDate: [],
				byProject: [],
				byUser: [],
			},
		},
	]);
	const { ctx, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	await runCli(
		[
			"entries",
			"stats",
			"--project",
			"api",
			"--user",
			"alice@example.com",
			"--tag",
			"infra",
			"--from",
			"2026-06-01",
			"--to",
			"2026-06-12",
		],
		ctx,
	);
	const query = stub.calls.find((call) =>
		call.url.pathname.endsWith("/work-entries/stats"),
	)?.url.searchParams;
	expect(query?.get("projectId")).toBe(apiProject.id);
	expect(query?.get("userId")).toBe("u1");
	expect(query?.get("tag")).toBe("infra");
	expect(query?.get("from")).toBe("2026-06-01");
	expect(query?.get("to")).toBe("2026-06-12");
});

it("lists tags one per line", async () => {
	const stub = fakeApi([
		{ path: "/workspaces", body: [acme] },
		{ path: "/work-entries/tags", body: ["ci", "infra"] },
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	expect(await runCli(["entries", "tags"], ctx)).toBe(0);
	expect(stdout.text()).toBe("ci\ninfra\n");
});

it("rejects invalid dates and limits", async () => {
	const cases: Array<{ argv: string[]; message: string }> = [
		{
			argv: ["entries", "list", "--from", "junk"],
			message: 'invalid --from "junk"',
		},
		{
			argv: ["entries", "list", "--limit", "0"],
			message: 'invalid --limit "0"',
		},
		{
			argv: ["entries", "list", "--limit", "201"],
			message: 'invalid --limit "201"',
		},
	];
	for (const { argv, message } of cases) {
		const { ctx, stderr, configDir } = createTestContext({
			fetch: api([]).fetch,
		});
		loggedIn(configDir);
		expect(await runCli(argv, ctx)).toBe(2);
		expect(stderr.text()).toContain(message);
	}
});
