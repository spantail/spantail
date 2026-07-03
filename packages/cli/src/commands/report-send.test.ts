import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import { createTestContext, fakeApi, recipientFixture } from "../test-helpers";

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
	});
}

it("lists recipients as a table", async () => {
	const api = fakeApi([
		{
			path: "/reports/rep-1/recipients",
			body: [recipientFixture(), recipientFixture({ id: "u3", name: "Cara" })],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "recipients", "rep-1"], ctx)).toBe(0);
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toMatch(/^USER ID\s+NAME\s+EMAIL$/);
	expect(lines[1]).toContain("bob@example.com");
	expect(lines[2]).toContain("Cara");
});

it("sends to resolved recipients and self", async () => {
	const api = fakeApi([
		{ path: "/reports/rep-1/recipients", body: [recipientFixture()] },
		{ method: "POST", path: "/reports/rep-1/send", body: { delivered: 2 } },
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(
		await runCli(
			[
				"report",
				"send",
				"rep-1",
				"--to",
				"bob@example.com",
				"--self",
				"--message",
				"FYI",
			],
			ctx,
		),
	).toBe(0);
	const post = api.calls.find((call) => call.method === "POST");
	expect(post?.body).toEqual({
		recipientUserIds: ["u2"],
		sendToSelf: true,
		message: "FYI",
	});
	expect(stdout.text()).toBe("Delivered to 2 recipient(s)\n");
});

it("rejects send without recipients", async () => {
	const { ctx, stderr, configDir } = createTestContext();
	loggedIn(configDir);
	expect(await runCli(["report", "send", "rep-1"], ctx)).toBe(2);
	expect(stderr.text()).toContain("--to <id-or-email> or --self");
});

it("rejects an unknown recipient with the candidates", async () => {
	const api = fakeApi([
		{ path: "/reports/rep-1/recipients", body: [recipientFixture()] },
	]);
	const { ctx, stderr, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(
		await runCli(["report", "send", "rep-1", "--to", "nobody@example.com"], ctx),
	).toBe(1);
	expect(stderr.text()).toContain('unknown recipient "nobody@example.com"');
	expect(stderr.text()).toContain("bob@example.com");
});

it("shows the send history", async () => {
	const api = fakeApi([
		{
			path: "/reports/rep-1/sends",
			body: [
				{
					id: "batch-1",
					createdAt: "2026-06-14T12:00:00Z",
					message: "FYI",
					recipientNames: ["Bob", "Cara"],
					recipientCount: 2,
					readCount: 1,
				},
			],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "sends", "rep-1"], ctx)).toBe(0);
	const text = stdout.text();
	expect(text).toContain("Bob, Cara");
	expect(text).toContain("1/2");
	expect(text).toContain("FYI");
});
