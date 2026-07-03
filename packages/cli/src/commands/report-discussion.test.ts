import { expect, it } from "vitest";

import { runCli } from "../cli";
import { saveConfig } from "../config";
import { commentFixture, createTestContext, fakeApi } from "../test-helpers";

function loggedIn(configDir: string): void {
	saveConfig(configDir, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat_test",
	});
}

it("shows reactions and comments", async () => {
	const api = fakeApi([
		{
			path: "/reports/rep-1/discussion",
			body: {
				shared: true,
				reactions: [
					{
						emoji: "+1",
						count: 2,
						reactedByMe: true,
						userNames: ["Alice", "Bob"],
					},
				],
				comments: [
					commentFixture(),
					commentFixture({
						id: "com-2",
						body: "Edited later",
						updatedAt: "2026-06-14T11:00:00Z",
						reactions: [
							{
								emoji: "heart",
								count: 1,
								reactedByMe: false,
								userNames: ["Alice"],
							},
						],
					}),
				],
			},
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "discussion", "rep-1"], ctx)).toBe(0);
	const text = stdout.text();
	expect(text).toContain("Reactions: +1 x2 (Alice, Bob)");
	expect(text).toContain("com-1  Bob  2026-06-14T10:00:00Z");
	expect(text).toContain("Nice work!");
	expect(text).toContain("com-2  Bob  2026-06-14T10:00:00Z (edited)");
	expect(text).toContain("  reactions: heart x1 (Alice)");
});

it("explains an empty discussion of an unsent report", async () => {
	const api = fakeApi([
		{
			path: "/reports/rep-1/discussion",
			body: { shared: false, reactions: [], comments: [] },
		},
	]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		fetch: api.fetch,
	});
	loggedIn(configDir);

	expect(await runCli(["report", "discussion", "rep-1"], ctx)).toBe(0);
	expect(stdout.text()).toBe("");
	expect(stderr.text()).toContain("has not been sent");
});

it("adds a comment", async () => {
	const api = fakeApi([
		{
			method: "POST",
			path: "/reports/rep-1/comments",
			body: commentFixture({ id: "com-9" }),
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "comment", "rep-1", "Looks good"], ctx)).toBe(
		0,
	);
	const post = api.calls.find((call) => call.method === "POST");
	expect(post?.body).toEqual({ body: "Looks good" });
	expect(stdout.text()).toBe("Added comment com-9\n");
});

it("edits a comment", async () => {
	const api = fakeApi([
		{
			method: "PATCH",
			path: "/reports/rep-1/comments/com-1",
			body: commentFixture(),
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(
		await runCli(
			["report", "comment", "rep-1", "--edit", "com-1", "New text"],
			ctx,
		),
	).toBe(0);
	const patch = api.calls.find((call) => call.method === "PATCH");
	expect(patch?.body).toEqual({ body: "New text" });
	expect(stdout.text()).toBe("Updated comment com-1\n");
});

it("deletes a comment after confirmation", async () => {
	const api = fakeApi([
		{ method: "DELETE", path: "/reports/rep-1/comments/com-1", body: {} },
	]);
	const { ctx, stdout, configDir } = createTestContext({
		fetch: api.fetch,
		answers: ["y"],
	});
	loggedIn(configDir);

	expect(
		await runCli(["report", "comment", "rep-1", "--delete", "com-1"], ctx),
	).toBe(0);
	expect(api.calls.some((call) => call.method === "DELETE")).toBe(true);
	expect(stdout.text()).toBe("Deleted comment com-1\n");
});

it("rejects --edit combined with --delete", async () => {
	const { ctx, stderr, configDir } = createTestContext();
	loggedIn(configDir);
	expect(
		await runCli(
			["report", "comment", "rep-1", "--edit", "a", "--delete", "b"],
			ctx,
		),
	).toBe(2);
	expect(stderr.text()).toContain("mutually exclusive");
});

it("toggles a reaction on the report body", async () => {
	const api = fakeApi([
		{
			method: "PUT",
			path: "/reports/rep-1/reactions",
			body: [
				{ emoji: "rocket", count: 1, reactedByMe: true, userNames: ["Me"] },
			],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(await runCli(["report", "react", "rep-1", "rocket"], ctx)).toBe(0);
	const put = api.calls.find((call) => call.method === "PUT");
	expect(put?.body).toEqual({ emoji: "rocket" });
	expect(stdout.text()).toBe("Added rocket (now x1)\n");
});

it("maps thumbs-down to -1 and targets a comment", async () => {
	const api = fakeApi([
		{
			method: "PUT",
			path: "/reports/rep-1/comments/com-1/reactions",
			body: [],
		},
	]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	loggedIn(configDir);

	expect(
		await runCli(
			["report", "react", "rep-1", "thumbs-down", "--comment", "com-1"],
			ctx,
		),
	).toBe(0);
	const put = api.calls.find((call) => call.method === "PUT");
	expect(put?.body).toEqual({ emoji: "-1" });
	expect(stdout.text()).toBe("Removed -1\n");
});

it("rejects an unknown emoji naming the choices", async () => {
	const { ctx, stderr, configDir } = createTestContext();
	loggedIn(configDir);
	expect(await runCli(["report", "react", "rep-1", "sparkles"], ctx)).toBe(2);
	expect(stderr.text()).toContain('invalid emoji "sparkles"');
	expect(stderr.text()).toContain("thumbs-down");
});
