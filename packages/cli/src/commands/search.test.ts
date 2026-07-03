import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import { createTestContext, entryFixture, fakeApi } from "../test-helpers";

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
	});
}

it("prints entry and report sections with counts on stderr", async () => {
	const api = fakeApi([
		{
			path: "/search",
			body: {
				workEntries: [entryFixture({ description: "Fixed the build" })],
				reports: [{ id: "rep-1", name: "Weekly" }],
			},
		},
	]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: api.fetch,
	});
	loggedIn(configDir);

	expect(await runCli(["search", "build"], ctx)).toBe(0);
	expect(api.calls[0]?.url.searchParams.get("q")).toBe("build");
	const text = stdout.text();
	expect(text).toContain("WORK ENTRIES");
	expect(text).toContain("Fixed the build");
	expect(text).toContain("REPORTS");
	expect(text).toContain("Weekly");
	expect(stderr.text()).toBe("1 entries, 1 reports\n");
});

it("omits empty sections and reports no matches", async () => {
	const api = fakeApi([
		{ path: "/search", body: { workEntries: [], reports: [] } },
	]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: api.fetch,
	});
	loggedIn(configDir);

	expect(await runCli(["search", "nothing"], ctx)).toBe(0);
	expect(stdout.text()).toBe("");
	expect(stderr.text()).toBe("No matches.\n");
});

it("rejects an over-long query", async () => {
	const { ctx, stderr, configDir } = createTestContext();
	loggedIn(configDir);
	expect(await runCli(["search", "x".repeat(101)], ctx)).toBe(2);
	expect(stderr.text()).toContain("1-100 characters");
});
