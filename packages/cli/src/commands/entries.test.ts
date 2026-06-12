import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import {
	createTestContext,
	entryFixture,
	fakeApi,
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
		baseUrl: "https://toxil.example.com",
		token: "toxil_pat_test",
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
