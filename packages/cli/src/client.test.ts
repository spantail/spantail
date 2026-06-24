import { writeFileSync } from "node:fs";

import { expect, it } from "vitest";

import { resolveConnection } from "./client";
import { configPath, saveConfig } from "./config";
import { CliError } from "./errors";
import { createTestContext } from "./test-helpers";

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
