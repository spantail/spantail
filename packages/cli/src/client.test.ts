import { writeFileSync } from "node:fs";

import { expect, it } from "vitest";

import { createClient, resolveConnection } from "./client";
import { configPath, saveConfig } from "./config";
import { CliError } from "./errors";
import { createTestContext } from "./test-helpers";
import { MIN_SERVER_VERSION } from "./version";

const stored = {
	baseUrl: "https://config.example.com",
	token: "spantail_pat_config",
};

it("prefers environment variables over the config file", () => {
	const { ctx, configDir } = createTestContext({
		env: {
			SPANTAIL_API_URL: "https://env.example.com",
			SPANTAIL_API_TOKEN: "spantail_pat_env",
		},
	});
	saveConfig(configDir, stored);

	expect(resolveConnection(ctx)).toEqual({
		baseUrl: "https://env.example.com",
		token: "spantail_pat_env",
		baseUrlSource: "env",
		tokenSource: "env",
	});
});

it("falls back to the config file", () => {
	const { ctx, configDir } = createTestContext();
	saveConfig(configDir, stored);

	expect(resolveConnection(ctx)).toEqual({
		baseUrl: "https://config.example.com",
		token: "spantail_pat_config",
		baseUrlSource: "config",
		tokenSource: "config",
	});
});

it("merges per field", () => {
	const { ctx, configDir } = createTestContext({
		env: { SPANTAIL_API_URL: "https://env.example.com" },
	});
	saveConfig(configDir, stored);

	expect(resolveConnection(ctx)).toEqual({
		baseUrl: "https://env.example.com",
		token: "spantail_pat_config",
		baseUrlSource: "env",
		tokenSource: "config",
	});
});

it("never reads the config file when the env is complete", () => {
	const { ctx, configDir } = createTestContext({
		env: {
			SPANTAIL_API_URL: "https://env.example.com",
			SPANTAIL_API_TOKEN: "spantail_pat_env",
		},
	});
	saveConfig(configDir, stored);
	writeFileSync(configPath(configDir), "corrupt");

	expect(resolveConnection(ctx)?.baseUrl).toBe("https://env.example.com");
});

it("surfaces a corrupt config file when the env leaves a gap", () => {
	const { ctx, configDir } = createTestContext();
	saveConfig(configDir, stored);
	writeFileSync(configPath(configDir), "corrupt");

	expect(() => resolveConnection(ctx)).toThrow(CliError);
});

it("returns null without credentials", () => {
	const { ctx } = createTestContext();
	expect(resolveConnection(ctx)).toBeNull();
});

/** A fetch stub answering /me, stamped with the given server version header. */
function serverAt(version: string | null) {
	return (async () =>
		new Response(JSON.stringify({ id: "usr_1" }), {
			headers: version ? { "x-spantail-version": version } : {},
		})) as typeof fetch;
}

async function callMeTwice(fetchImpl: typeof fetch) {
	const { ctx, stderr } = createTestContext({ fetch: fetchImpl });
	const client = createClient(ctx, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat",
	});
	await client.me();
	await client.me();
	return stderr.text();
}

it("warns once when the server is older than the CLI expects", async () => {
	const warning = await callMeTwice(serverAt("v0.1.0"));

	expect(warning).toBe(
		`spantail: server v0.1.0 is older than ${MIN_SERVER_VERSION}, the oldest version this CLI is tested against; some commands may fail\n`,
	);
});

it("stays silent for a server at or beyond the minimum", async () => {
	expect(await callMeTwice(serverAt(MIN_SERVER_VERSION))).toBe("");
	expect(await callMeTwice(serverAt("v9.9.9"))).toBe("");
});

it("stays silent when the server version is not a clean release tag", async () => {
	// `git describe` output from a clone, a fork, or a build without git history.
	expect(await callMeTwice(serverAt("v0.1.0-7-gabc"))).toBe("");
	expect(await callMeTwice(serverAt("unknown"))).toBe("");
	expect(await callMeTwice(serverAt(null))).toBe("");
});

/** The server attributes a work entry's source to this hint, so it must survive. */
async function clientHintFor(client?: "cli" | "mcp") {
	let sent: Record<string, string> = {};
	const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
		sent = (init?.headers ?? {}) as Record<string, string>;
		return new Response("{}");
	}) as typeof fetch;
	const { ctx } = createTestContext({ fetch: fetchImpl });
	await createClient(ctx, {
		baseUrl: "https://spantail.example.com",
		token: "spantail_pat",
		client,
	}).me();
	return sent["x-spantail-client"];
}

it("tags requests as cli unless told otherwise", async () => {
	expect(await clientHintFor()).toBe("cli");
	expect(await clientHintFor("mcp")).toBe("mcp");
});
