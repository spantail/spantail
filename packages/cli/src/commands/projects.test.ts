import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import {
	createTestContext,
	fakeApi,
	projectFixture,
	workspaceFixture,
} from "../test-helpers";

const acme = workspaceFixture("acme", "owner");

function api() {
	return fakeApi([
		{ path: "/workspaces", body: [acme, workspaceFixture("beta")] },
		{
			path: `/workspaces/${acme.id}/projects`,
			body: [
				projectFixture("api", acme.id),
				projectFixture("legacy", acme.id, "archived"),
			],
		},
	]);
}

function loggedIn(configDir: string, defaultWorkspace?: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
		...(defaultWorkspace ? { defaultWorkspace } : {}),
	});
}

it("lists projects for the workspace flag", async () => {
	const { ctx, stdout, configDir } = createTestContext({ fetch: api().fetch });
	loggedIn(configDir);

	expect(await runCli(["projects", "list", "--workspace", "acme"], ctx)).toBe(
		0,
	);
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toBe("SLUG    NAME    STATUS");
	expect(lines[1]).toBe("api     API     active");
	expect(lines[2]).toBe("legacy  LEGACY  archived");
});

it("falls back to the configured default workspace", async () => {
	const { ctx, stdout, configDir } = createTestContext({ fetch: api().fetch });
	loggedIn(configDir, "acme");

	expect(await runCli(["projects", "list"], ctx)).toBe(0);
	expect(stdout.text()).toContain("api");
});

it("fails without any workspace selection", async () => {
	const { ctx, stderr, configDir } = createTestContext({ fetch: api().fetch });
	loggedIn(configDir);

	expect(await runCli(["projects", "list"], ctx)).toBe(2);
	expect(stderr.text()).toContain("no workspace selected");
});

it("lists available slugs for an unknown workspace", async () => {
	const { ctx, stderr, configDir } = createTestContext({ fetch: api().fetch });
	loggedIn(configDir);

	expect(await runCli(["projects", "list", "--workspace", "nope"], ctx)).toBe(
		1,
	);
	expect(stderr.text()).toContain('unknown workspace "nope"');
	expect(stderr.text()).toContain("acme, beta");
});
