import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import {
	createTestContext,
	type FakeRoute,
	fakeApi,
	projectFixture,
	workspaceFixture,
} from "../test-helpers";

const acme = workspaceFixture("acme", "owner");
const apiProject = projectFixture("api", acme.id);
const opsProject = projectFixture("ops", acme.id);

function api(extra: FakeRoute[] = []) {
	return fakeApi([
		{ path: "/workspaces", body: [acme] },
		{
			path: `/workspaces/${acme.id}/projects`,
			body: [apiProject, opsProject],
		},
		...extra,
		{
			method: "POST",
			path: "/work-entries/batch",
			status: 201,
			body: { count: 1 },
		},
	]);
}

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
		defaultWorkspace: "acme",
	});
}

function jsonlFile(lines: string[]): string {
	const dir = mkdtempSync(path.join(os.tmpdir(), "spantail-import-"));
	const file = path.join(dir, "entries.jsonl");
	writeFileSync(file, `${lines.join("\n")}\n`);
	return file;
}

const entryLine = (overrides: Record<string, unknown> = {}) =>
	JSON.stringify({
		entryDate: "2026-06-01",
		durationMinutes: 60,
		description: "migrated",
		...overrides,
	});

it("imports a file resolving per-line and default project slugs", async () => {
	const stub = api();
	const { ctx, stdout, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	const file = jsonlFile([
		entryLine({ project: "ops", externalId: "legacy-1" }),
		entryLine({ description: "second" }),
	]);
	const code = await runCli(
		["entries", "import", file, "--project", "api"],
		ctx,
	);

	expect(code).toBe(0);
	const post = stub.calls.find((call) => call.method === "POST");
	expect(post?.body).toEqual({
		workspaceId: acme.id,
		entries: [
			{
				projectId: opsProject.id,
				entryDate: "2026-06-01",
				durationMinutes: 60,
				description: "migrated",
				// The core schema's default; the server accepts it as-is.
				tags: [],
				externalId: "legacy-1",
			},
			{
				projectId: apiProject.id,
				entryDate: "2026-06-01",
				durationMinutes: 60,
				description: "second",
				tags: [],
			},
		],
	});
	expect(stdout.text()).toBe("Imported 2 entries into acme (1 request)\n");
});

it("fails before any request when a line is invalid", async () => {
	const stub = api();
	const { ctx, stderr, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	const file = jsonlFile([entryLine({ project: "api" }), "broken"]);
	expect(await runCli(["entries", "import", file], ctx)).toBe(1);
	expect(stderr.text()).toContain("line 2: invalid JSON");
	expect(stub.calls).toHaveLength(0);
});

it("fails before any request on a missing or unknown project", async () => {
	const missing = api();
	const first = createTestContext({ fetch: missing.fetch });
	loggedIn(first.configDir);
	const noProject = jsonlFile([entryLine()]);
	expect(await runCli(["entries", "import", noProject], first.ctx)).toBe(1);
	expect(first.stderr.text()).toContain(
		'line 1: no project; add a "project" field or pass --project',
	);
	expect(missing.calls.some((call) => call.method === "POST")).toBe(false);

	const unknown = api();
	const second = createTestContext({ fetch: unknown.fetch });
	loggedIn(second.configDir);
	const badProject = jsonlFile([entryLine({ project: "nope" })]);
	expect(await runCli(["entries", "import", badProject], second.ctx)).toBe(1);
	expect(second.stderr.text()).toContain(
		'line 1: unknown project "nope" in workspace "acme" (available: api, ops)',
	);
	expect(unknown.calls.some((call) => call.method === "POST")).toBe(false);
});

it("splits large files into batches of 1000 preserving order", async () => {
	const stub = api();
	const { ctx, stdout, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	const file = jsonlFile(
		Array.from({ length: 2500 }, (_, i) =>
			entryLine({ project: "api", description: `entry ${i}` }),
		),
	);
	expect(await runCli(["entries", "import", file], ctx)).toBe(0);

	const posts = stub.calls.filter((call) => call.method === "POST");
	expect(posts).toHaveLength(3);
	const sizes = posts.map(
		(post) => (post.body as { entries: unknown[] }).entries.length,
	);
	expect(sizes).toEqual([1000, 1000, 500]);
	const firstOfSecond = (
		posts[1]?.body as { entries: Array<{ description: string }> }
	).entries[0];
	expect(firstOfSecond?.description).toBe("entry 1000");
	expect(stdout.text()).toContain("imported 1000/2500 (request 1/3)");
	expect(stdout.text()).toContain(
		"Imported 2500 entries into acme (3 requests)",
	);
});

it("reports the resume point when a later batch fails", async () => {
	const stub = api([
		{
			method: "POST",
			path: "/work-entries/batch",
			status: 201,
			body: { count: 1000 },
			once: true,
		},
		{
			method: "POST",
			path: "/work-entries/batch",
			status: 400,
			body: { error: { code: "bad_request", message: "boom" } },
			once: true,
		},
	]);
	const { ctx, stderr, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	const file = jsonlFile(
		Array.from({ length: 1500 }, () => entryLine({ project: "api" })),
	);
	expect(await runCli(["entries", "import", file], ctx)).toBe(1);
	expect(stderr.text()).toContain("request 2/2 failed");
	expect(stderr.text()).toContain(
		"1000 of 1500 entries were imported (through line 1000)",
	);
	expect(stderr.text()).toContain(
		"Entries from line 1001 on were NOT imported",
	);

	// With externalIds on every line the guidance flips to "just re-run".
	const idsStub = api([
		{
			method: "POST",
			path: "/work-entries/batch",
			status: 400,
			body: { error: { code: "bad_request", message: "boom" } },
			once: true,
		},
	]);
	const withIds = createTestContext({ fetch: idsStub.fetch });
	loggedIn(withIds.configDir);
	const idsFile = jsonlFile([
		entryLine({ project: "api", externalId: "a" }),
		entryLine({ project: "api", externalId: "b" }),
	]);
	expect(await runCli(["entries", "import", idsFile], withIds.ctx)).toBe(1);
	expect(withIds.stderr.text()).toContain("re-running the same file is safe");
});

it("validates without posting on --dry-run", async () => {
	const stub = api();
	const { ctx, stdout, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);

	const file = jsonlFile([
		entryLine({ project: "api" }),
		entryLine({ project: "ops" }),
	]);
	expect(await runCli(["entries", "import", file, "--dry-run"], ctx)).toBe(0);
	expect(stub.calls.some((call) => call.method === "POST")).toBe(false);
	expect(stdout.text()).toBe(
		"Dry run: 2 entries across 2 project(s) would be imported into acme (1 request)\n",
	);
});

it("reports an unreadable file and missing positional", async () => {
	const stub = api();
	const { ctx, stderr, configDir } = createTestContext({ fetch: stub.fetch });
	loggedIn(configDir);
	expect(await runCli(["entries", "import", "/nope/entries.jsonl"], ctx)).toBe(
		1,
	);
	expect(stderr.text()).toContain('cannot read "/nope/entries.jsonl"');

	const second = createTestContext({ fetch: stub.fetch });
	loggedIn(second.configDir);
	expect(await runCli(["entries", "import"], second.ctx)).toBe(2);
	expect(second.stderr.text()).toContain("missing <file.jsonl>");
});
