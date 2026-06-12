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

function api() {
	return fakeApi([
		{ path: "/workspaces", body: [acme] },
		{ path: `/workspaces/${acme.id}/projects`, body: [apiProject] },
		{
			method: "POST",
			path: "/work-entries",
			status: 201,
			body: entryFixture({
				projectId: apiProject.id,
				durationMinutes: 90,
				entryDate: "2026-06-12",
				description: "Fixed the build",
			}),
		},
	]);
}

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://toxil.example.com",
		token: "toxil_pat_test",
		defaultWorkspace: "acme",
	});
}

it("logs a work entry with resolved ids and a parsed duration", async () => {
	const stub = api();
	const { ctx, stdout, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	const code = await runCli(
		[
			"log",
			"Fixed the build",
			"--project",
			"api",
			"--duration",
			"1h30m",
			"--tag",
			"ci",
			"--tag",
			"infra",
			"--note",
			"flaky cache",
		],
		ctx,
	);

	expect(code).toBe(0);
	const post = stub.calls.find((call) => call.method === "POST");
	expect(post?.body).toEqual({
		workspaceId: acme.id,
		projectId: apiProject.id,
		durationMinutes: 90,
		description: "Fixed the build",
		note: "flaky cache",
		tags: ["ci", "infra"],
	});
	expect(stdout.text()).toBe(
		"Logged 1h 30m to acme/api on 2026-06-12 (id: entry-1)\n",
	);
});

it("passes an explicit date and omits it otherwise", async () => {
	const withDate = api();
	const first = createTestContext({ fetch: withDate.fetch });
	loggedIn(first.configDir);
	await runCli(
		[
			"log",
			"x",
			"--project",
			"api",
			"--duration",
			"15",
			"--date",
			"2026-06-01",
		],
		first.ctx,
	);
	const post = withDate.calls.find((call) => call.method === "POST");
	expect(post?.body).toMatchObject({ entryDate: "2026-06-01" });

	const withoutDate = api();
	const second = createTestContext({ fetch: withoutDate.fetch });
	loggedIn(second.configDir);
	await runCli(
		["log", "x", "--project", "api", "--duration", "15"],
		second.ctx,
	);
	const omitted = withoutDate.calls.find((call) => call.method === "POST");
	expect(omitted?.body).not.toHaveProperty("entryDate");
});

it("rejects missing required flags and positionals", async () => {
	const cases: Array<{ argv: string[]; message: string }> = [
		{ argv: ["log"], message: "missing <description>" },
		{
			argv: ["log", "a", "b", "--project", "api", "--duration", "15"],
			message: "single <description>",
		},
		{
			argv: ["log", "x", "--duration", "15"],
			message: "--project is required",
		},
		{
			argv: ["log", "x", "--project", "api"],
			message: "--duration is required",
		},
	];
	for (const { argv, message } of cases) {
		const { ctx, stderr, configDir } = createTestContext({
			fetch: api().fetch,
		});
		loggedIn(configDir);
		expect(await runCli(argv, ctx)).toBe(2);
		expect(stderr.text()).toContain(message);
	}
});

it("rejects unparseable durations and dates", async () => {
	for (const argv of [
		["log", "x", "--project", "api", "--duration", "1.5h"],
		[
			"log",
			"x",
			"--project",
			"api",
			"--duration",
			"15",
			"--date",
			"2026-13-01",
		],
	]) {
		const { ctx, configDir } = createTestContext({ fetch: api().fetch });
		loggedIn(configDir);
		expect(await runCli(argv, ctx)).toBe(2);
	}
});

it("lists available project slugs on a miss", async () => {
	const { ctx, stderr, configDir } = createTestContext({ fetch: api().fetch });
	loggedIn(configDir);

	expect(
		await runCli(["log", "x", "--project", "nope", "--duration", "15"], ctx),
	).toBe(1);
	expect(stderr.text()).toContain('unknown project "nope" in workspace "acme"');
	expect(stderr.text()).toContain("api");
});
