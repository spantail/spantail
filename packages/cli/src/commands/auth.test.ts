import { existsSync } from "node:fs";

import type { WorkspaceWithRole } from "@toxil/core";
import { expect, it } from "vitest";

import { runCli } from "../cli";
import { configPath, loadConfig, saveConfig } from "../config";
import { createTestContext, fakeApi } from "../test-helpers";

const TOKEN = `toxil_pat_${"a".repeat(43)}`;

function membership(
	slug: string,
	name: string,
	role: WorkspaceWithRole["role"],
): WorkspaceWithRole {
	return {
		id: `id-${slug}`,
		slug,
		name,
		timezone: "Asia/Tokyo",
		settings: {},
		createdAt: "2026-06-01T00:00:00Z",
		archivedAt: null,
		role,
	};
}

const me = {
	user: { id: "u1", name: "Kato", email: "kato@example.com", isAdmin: true },
	memberships: [
		membership("acme", "Acme", "owner"),
		membership("beta", "Beta Corp", "member"),
	],
};

it("logs in non-interactively with flags and writes the config", async () => {
	const api = fakeApi([{ path: "/me", body: me }]);
	const { ctx, stdout, stderr, configDir } = createTestContext({
		interactive: false,
		fetch: api.fetch,
	});

	const code = await runCli(
		[
			"auth",
			"login",
			"--server",
			"https://toxil.example.com/",
			"--token",
			TOKEN,
			"--workspace",
			"beta",
		],
		ctx,
	);

	expect(code).toBe(0);
	expect(loadConfig(configDir)).toEqual({
		baseUrl: "https://toxil.example.com",
		token: TOKEN,
		defaultWorkspace: "beta",
	});
	expect(stdout.text()).toContain(
		"Logged in to https://toxil.example.com as kato@example.com",
	);
	expect(stdout.text()).toContain("Default workspace: beta");
	expect(stderr.text()).toBe("");
	expect(api.calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
});

it("warns about tokens that do not look like a PAT", async () => {
	const api = fakeApi([{ path: "/me", body: me }]);
	const { ctx, stderr } = createTestContext({
		interactive: false,
		fetch: api.fetch,
	});

	const code = await runCli(
		["auth", "login", "--server", "http://localhost:5173", "--token", "oops"],
		ctx,
	);

	expect(code).toBe(0);
	expect(stderr.text()).toContain("does not look like a Toxil API token");
});

it("prompts for server, token, and workspace interactively", async () => {
	const api = fakeApi([{ path: "/me", body: me }]);
	const { ctx, configDir } = createTestContext({
		answers: ["https://toxil.example.com", TOKEN, "2"],
		fetch: api.fetch,
	});

	expect(await runCli(["auth", "login"], ctx)).toBe(0);
	expect(loadConfig(configDir)?.defaultWorkspace).toBe("beta");
});

it("auto-picks the default workspace with a single membership", async () => {
	const single = { ...me, memberships: [membership("acme", "Acme", "owner")] };
	const api = fakeApi([{ path: "/me", body: single }]);
	const { ctx, configDir } = createTestContext({
		answers: ["https://toxil.example.com", TOKEN],
		fetch: api.fetch,
	});

	expect(await runCli(["auth", "login"], ctx)).toBe(0);
	expect(loadConfig(configDir)?.defaultWorkspace).toBe("acme");
});

it("requires flags when stdin is not a terminal", async () => {
	const { ctx, stderr } = createTestContext({ interactive: false });
	expect(await runCli(["auth", "login"], ctx)).toBe(2);
	expect(stderr.text()).toContain("--server and --token");
});

it("rejects a workspace flag outside the memberships", async () => {
	const api = fakeApi([{ path: "/me", body: me }]);
	const { ctx, stderr, configDir } = createTestContext({
		interactive: false,
		fetch: api.fetch,
	});

	const code = await runCli(
		[
			"auth",
			"login",
			"--server",
			"https://toxil.example.com",
			"--token",
			TOKEN,
			"--workspace",
			"nope",
		],
		ctx,
	);

	expect(code).toBe(1);
	expect(stderr.text()).toContain('not a member of workspace "nope"');
	expect(stderr.text()).toContain("acme, beta");
	expect(existsSync(configPath(configDir))).toBe(false);
});

it("fails login on a rejected token without writing the config", async () => {
	const api = fakeApi([
		{
			path: "/me",
			status: 401,
			body: { error: { code: "unauthorized", message: "Invalid token" } },
		},
	]);
	const { ctx, stderr, configDir } = createTestContext({
		interactive: false,
		fetch: api.fetch,
	});

	const code = await runCli(
		[
			"auth",
			"login",
			"--server",
			"https://toxil.example.com",
			"--token",
			TOKEN,
		],
		ctx,
	);

	expect(code).toBe(1);
	expect(stderr.text()).toContain("login failed: Invalid token (status 401)");
	expect(existsSync(configPath(configDir))).toBe(false);
});

it("recognizes servers that are not a Toxil API", async () => {
	const htmlFetch = (async () =>
		new Response("<!doctype html><html></html>", {
			status: 200,
		})) as typeof fetch;
	const { ctx, stderr } = createTestContext({
		interactive: false,
		fetch: htmlFetch,
	});

	const code = await runCli(
		["auth", "login", "--server", "https://example.com", "--token", TOKEN],
		ctx,
	);

	expect(code).toBe(1);
	expect(stderr.text()).toContain("does not look like a Toxil server");
});

it("rejects an invalid server URL", async () => {
	const { ctx, stderr } = createTestContext({ interactive: false });
	const code = await runCli(
		["auth", "login", "--server", "not a url", "--token", TOKEN],
		ctx,
	);
	expect(code).toBe(1);
	expect(stderr.text()).toContain('invalid server URL "not a url"');
});

it("shows the connection and user in auth status", async () => {
	const api = fakeApi([{ path: "/me", body: me }]);
	const { ctx, stdout, configDir } = createTestContext({ fetch: api.fetch });
	saveConfig(configDir, {
		baseUrl: "https://toxil.example.com",
		token: TOKEN,
		defaultWorkspace: "gone",
	});

	expect(await runCli(["auth", "status"], ctx)).toBe(0);
	const out = stdout.text();
	expect(out).toContain(
		`Server: https://toxil.example.com (${configPath(configDir)})`,
	);
	expect(out).toContain(`Token: toxil_pat_…${TOKEN.slice(-4)}`);
	expect(out).not.toContain(TOKEN);
	expect(out).toContain("User: Kato <kato@example.com> (instance admin)");
	expect(out).toContain("Workspaces: acme (owner), beta (member)");
	expect(out).toContain(
		"Default workspace: gone (warning: not in your memberships)",
	);
});

it("reports the environment as the credential source", async () => {
	const api = fakeApi([{ path: "/me", body: me }]);
	const { ctx, stdout } = createTestContext({
		env: {
			TOXIL_API_URL: "https://env.example.com",
			TOXIL_API_TOKEN: TOKEN,
		},
		fetch: api.fetch,
	});

	expect(await runCli(["auth", "status"], ctx)).toBe(0);
	expect(stdout.text()).toContain(
		"Server: https://env.example.com (environment)",
	);
});

it("fails auth status when not logged in", async () => {
	const { ctx, stderr } = createTestContext();
	expect(await runCli(["auth", "status"], ctx)).toBe(1);
	expect(stderr.text()).toContain("not logged in");
});

it("adds a login hint when the API rejects the stored token", async () => {
	const api = fakeApi([
		{
			path: "/me",
			status: 401,
			body: { error: { code: "unauthorized", message: "Token expired" } },
		},
	]);
	const { ctx, stderr, configDir } = createTestContext({ fetch: api.fetch });
	saveConfig(configDir, { baseUrl: "https://toxil.example.com", token: TOKEN });

	expect(await runCli(["auth", "status"], ctx)).toBe(1);
	expect(stderr.text()).toContain("Token expired");
	expect(stderr.text()).toContain("hint: run `toxil auth login`");
});

it("removes the config on logout and stays idempotent", async () => {
	const { ctx, stdout, configDir } = createTestContext();
	saveConfig(configDir, { baseUrl: "https://toxil.example.com", token: TOKEN });

	expect(await runCli(["auth", "logout"], ctx)).toBe(0);
	expect(stdout.text()).toContain(`Removed ${configPath(configDir)}`);
	expect(existsSync(configPath(configDir))).toBe(false);

	expect(await runCli(["auth", "logout"], ctx)).toBe(0);
	expect(stdout.text()).toContain("No saved credentials.");
});

it("rejects auth without a subcommand", async () => {
	const { ctx, stderr } = createTestContext();
	expect(await runCli(["auth"], ctx)).toBe(2);
	expect(stderr.text()).toContain("toxil auth <login|status|logout>");
});
