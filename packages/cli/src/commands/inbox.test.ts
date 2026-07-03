import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import { createTestContext, fakeApi, mailItemFixture } from "../test-helpers";

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
	});
}

it("lists the inbox with unread markers", async () => {
	const api = fakeApi([
		{
			path: "/inbox",
			body: [
				mailItemFixture(),
				mailItemFixture({ id: "mail-2", readAt: "2026-06-15T00:00:00Z" }),
			],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["inbox", "list"], ctx)).toBe(0);
	const query = api.calls[0]?.url.searchParams;
	expect(query?.get("folder")).toBe("inbox");
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toMatch(/^ID\s+STATUS\s+FROM\s+REPORT/);
	expect(lines[1]).toContain("unread");
	expect(lines[1]).toContain("Bob");
	expect(lines[2]).not.toContain("unread");
});

it("shows batch ids and recipients for the sent folder", async () => {
	const api = fakeApi([
		{
			path: "/inbox",
			body: [
				mailItemFixture({
					scope: "sent",
					recipientNames: ["Cara", "Dan"],
					recipientCount: 2,
				}),
			],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["inbox", "list", "--folder", "sent"], ctx)).toBe(0);
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toMatch(/^ID\s+BATCH\s+TO\s+REPORT/);
	expect(lines[1]).toContain("batch-1");
	expect(lines[1]).toContain("Cara, Dan");
});

it("renders mixed scopes per item in the starred folder", async () => {
	const api = fakeApi([
		{
			path: "/inbox",
			body: [
				mailItemFixture({ starred: true }),
				mailItemFixture({
					id: "mail-2",
					scope: "sent",
					batchId: "batch-2",
					recipientNames: ["Cara"],
					recipientCount: 1,
					starred: true,
				}),
			],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["inbox", "list", "--folder", "starred"], ctx)).toBe(0);
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toMatch(/^ID\s+STATUS\s+FROM\/TO\s+BATCH\s+REPORT/);
	expect(lines[1]).toContain("unread");
	expect(lines[1]).toContain("Bob");
	expect(lines[2]).toContain("sent");
	expect(lines[2]).toContain("→ Cara");
	expect(lines[2]).toContain("batch-2");
});

it("rejects an unknown folder", async () => {
	const { ctx, stderr, configDir } = createTestContext();
	loggedIn(configDir);
	expect(await runCli(["inbox", "list", "--folder", "junk"], ctx)).toBe(2);
	expect(stderr.text()).toContain('invalid --folder "junk"');
});

it("views a received item without touching the read state", async () => {
	const api = fakeApi([
		{
			path: "/inbox/mail-1",
			body: {
				...mailItemFixture({ message: "FYI" }),
				renderedMarkdown: "# Frozen snapshot\n",
			},
		},
	]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: api.fetch,
	});
	loggedIn(configDir);

	expect(await runCli(["inbox", "view", "mail-1"], ctx)).toBe(0);
	expect(stdout.text()).toBe("# Frozen snapshot\n");
	expect(stderr.text()).toContain("From: Bob");
	expect(stderr.text()).toContain("Message: FYI");
	expect(api.calls.every((call) => call.method === "GET")).toBe(true);
});

it("shows folder counts", async () => {
	const api = fakeApi([
		{
			path: "/inbox/counts",
			body: { inbox: 3, unread: 2, starred: 1, sent: 5, archive: 0, trash: 0 },
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["inbox", "counts"], ctx)).toBe(0);
	const text = stdout.text();
	expect(text).toContain("inbox    3");
	expect(text).toContain("unread   2");
});

it("marks items read, unread, and all read", async () => {
	const api = fakeApi([
		{ method: "POST", path: "/inbox/mail-1/read", body: {} },
		{ method: "POST", path: "/inbox/mail-1/unread", body: {} },
		{ method: "POST", path: "/inbox/read-all", body: {} },
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["inbox", "read", "mail-1"], ctx)).toBe(0);
	expect(await runCli(["inbox", "unread", "mail-1"], ctx)).toBe(0);
	expect(await runCli(["inbox", "read-all"], ctx)).toBe(0);
	expect(api.calls.map((call) => call.url.pathname)).toEqual([
		"/api/v1/inbox/mail-1/read",
		"/api/v1/inbox/mail-1/unread",
		"/api/v1/inbox/read-all",
	]);
	expect(stdout.text()).toBe(
		"Marked mail-1 read\nMarked mail-1 unread\nMarked all read\n",
	);
});

it("sets flags on a received item", async () => {
	const api = fakeApi([{ method: "PATCH", path: "/inbox/flags", body: {} }]);
	const { ctx, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(
		await runCli(["inbox", "flag", "mail-1", "--star", "--archive"], ctx),
	).toBe(0);
	const patch = api.calls.find((call) => call.method === "PATCH");
	expect(patch?.body).toEqual({
		scope: "received",
		targetId: "mail-1",
		starred: true,
		archived: true,
	});
});

it("flags a sent batch with --sent and clears with the un- flags", async () => {
	const api = fakeApi([{ method: "PATCH", path: "/inbox/flags", body: {} }]);
	const { ctx, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(
		await runCli(["inbox", "flag", "batch-1", "--sent", "--unstar"], ctx),
	).toBe(0);
	const patch = api.calls.find((call) => call.method === "PATCH");
	expect(patch?.body).toEqual({
		scope: "sent",
		targetId: "batch-1",
		starred: false,
	});
});

it("rejects flag conflicts and flagless calls", async () => {
	for (const [argv, message] of [
		[
			["inbox", "flag", "mail-1", "--star", "--unstar"],
			"--star and --unstar are mutually exclusive",
		],
		[["inbox", "flag", "mail-1"], "pass at least one flag"],
	] as const) {
		const { ctx, stderr, configDir } = createTestContext();
		loggedIn(configDir);
		expect(await runCli([...argv], ctx)).toBe(2);
		expect(stderr.text()).toContain(message);
	}
});
