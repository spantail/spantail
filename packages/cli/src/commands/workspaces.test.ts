import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import { createTestContext, fakeApi, workspaceFixture } from "../test-helpers";

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
	});
}

it("lists workspaces as a table", async () => {
	const api = fakeApi([
		{
			path: "/workspaces",
			body: [workspaceFixture("acme", "owner"), workspaceFixture("beta")],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["workspaces", "list"], ctx)).toBe(0);
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toBe("SLUG  NAME  ROLE");
	expect(lines[1]).toBe("acme  ACME  owner");
	expect(lines[2]).toBe("beta  BETA  member");
});

it("reports an empty workspace list on stderr", async () => {
	const api = fakeApi([{ path: "/workspaces", body: [] }]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: api.fetch,
	});
	loggedIn(configDir);

	expect(await runCli(["workspaces", "list"], ctx)).toBe(0);
	expect(stdout.text()).toBe("");
	expect(stderr.text()).toContain("No workspaces.");
});

it("requires credentials", async () => {
	const { ctx, stderr } = createTestContext();
	expect(await runCli(["workspaces", "list"], ctx)).toBe(1);
	expect(stderr.text()).toContain("not logged in");
});
