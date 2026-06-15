import type { Report } from "@toxil/core";
import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import { createTestContext, fakeApi } from "../test-helpers";

function reportFixture(overrides: Partial<Report> = {}): Report {
	return {
		id: "rep-1",
		name: "Weekly",
		ownerUserId: "u1",
		templateId: "builtin:weekly",
		filters: {
			workspaceIds: ["ws-acme"],
			dateRange: { from: "2026-06-08", to: "2026-06-14" },
		},
		note: null,
		totalMinutes: 750,
		renderedMarkdown: "# Weekly report\n\n- did things\n",
		createdAt: "2026-06-01T00:00:00Z",
		updatedAt: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://toxil.example.com",
		token: "toxil_pat_test",
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
	expect(stderr.text()).toContain("toxil report list");
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
