import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import { createTestContext, fakeApi, shareFixture } from "../test-helpers";

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
	});
}

it("creates a share link and prints only the URL on stdout", async () => {
	const api = fakeApi([
		{
			method: "POST",
			path: "/reports/rep-1/shares",
			body: shareFixture({ expiresAt: "2026-07-14T00:00:00Z", hasPasscode: true }),
		},
	]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: api.fetch,
	});
	loggedIn(configDir);

	expect(
		await runCli(
			[
				"report",
				"share",
				"rep-1",
				"--expires-in",
				"30",
				"--passcode",
				"hunter22",
			],
			ctx,
		),
	).toBe(0);
	const post = api.calls.find((call) => call.method === "POST");
	expect(post?.body).toEqual({ expiresInDays: 30, passcode: "hunter22" });
	expect(stdout.text()).toBe(
		"https://spantail.example.com/share/tok_abcdefghijklmnopqr\n",
	);
	expect(stderr.text()).toContain("expires 2026-07-14T00:00:00Z");
	expect(stderr.text()).toContain("passcode required");
});

it("rejects an out-of-range expiry", async () => {
	const { ctx, stderr, configDir } = createTestContext();
	loggedIn(configDir);
	expect(
		await runCli(["report", "share", "rep-1", "--expires-in", "400"], ctx),
	).toBe(2);
	expect(stderr.text()).toContain('invalid --expires-in "400"');
});

it("lists share links with status", async () => {
	const api = fakeApi([
		{
			path: "/reports/rep-1/shares",
			body: [
				shareFixture(),
				shareFixture({
					id: "share-2",
					token: "tok_revoked1234567890ab",
					revokedAt: "2026-06-15T00:00:00Z",
					viewCount: 3,
				}),
			],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "shares", "rep-1"], ctx)).toBe(0);
	const lines = stdout.text().trimEnd().split("\n");
	expect(lines[0]).toMatch(/^SHARE ID\s+URL\s+STATUS/);
	expect(lines[1]).toContain("active");
	expect(lines[2]).toContain("revoked");
	expect(lines[2]).toContain("3");
});

it("revokes a share after confirmation", async () => {
	const api = fakeApi([
		{
			method: "POST",
			path: "/report-shares/share-1/revoke",
			body: shareFixture({ revokedAt: "2026-06-15T00:00:00Z" }),
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({
		fetch: api.fetch,
		answers: ["y"],
	});
	loggedIn(configDir);

	expect(await runCli(["report", "unshare", "share-1"], ctx)).toBe(0);
	expect(api.calls.some((call) => call.method === "POST")).toBe(true);
	expect(stdout.text()).toBe("Revoked share share-1\n");
});

it("refuses to revoke non-interactively without --yes", async () => {
	const api = fakeApi([]);
	const { ctx, stderr, configDir } = createTestContext({
		fetch: api.fetch,
		interactive: false,
	});
	loggedIn(configDir);

	expect(await runCli(["report", "unshare", "share-1"], ctx)).toBe(1);
	expect(api.calls.length).toBe(0);
	expect(stderr.text()).toContain("pass --yes");
});
