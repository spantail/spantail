import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import {
	type CliConfig,
	configPath,
	deleteConfig,
	loadConfig,
	resolveConfigDir,
	saveConfig,
} from "./config";
import { CliError } from "./errors";

const onPosix = process.platform !== "win32";

function tempDir(): string {
	return path.join(
		mkdtempSync(path.join(os.tmpdir(), "toxil-config-test-")),
		"toxil",
	);
}

const config: CliConfig = {
	baseUrl: "https://toxil.example.com",
	token: "toxil_pat_test",
	defaultWorkspace: "acme",
};

it("round-trips a config file", () => {
	const dir = tempDir();
	saveConfig(dir, config);
	expect(loadConfig(dir)).toEqual(config);
});

it("creates the file and directory with restrictive permissions", () => {
	const dir = tempDir();
	saveConfig(dir, config);
	if (onPosix) {
		expect(statSync(dir).mode & 0o777).toBe(0o700);
		expect(statSync(configPath(dir)).mode & 0o777).toBe(0o600);
	}
});

it("repairs permissions of a pre-existing looser file", () => {
	const dir = tempDir();
	saveConfig(dir, config);
	if (!onPosix) return;
	writeFileSync(configPath(dir), "{}", { mode: 0o644 });
	saveConfig(dir, config);
	expect(statSync(configPath(dir)).mode & 0o777).toBe(0o600);
});

it("returns null when no config exists", () => {
	expect(loadConfig(tempDir())).toBeNull();
});

it("rejects corrupt and schema-invalid files with the path", () => {
	for (const content of ["not json", JSON.stringify({ baseUrl: "nope" })]) {
		const dir = tempDir();
		saveConfig(dir, config);
		writeFileSync(configPath(dir), content);
		const error = (() => {
			try {
				loadConfig(dir);
				return null;
			} catch (caught) {
				return caught;
			}
		})();
		expect(error).toBeInstanceOf(CliError);
		expect((error as CliError).message).toContain(configPath(dir));
	}
});

it("deletes idempotently", () => {
	const dir = tempDir();
	saveConfig(dir, config);
	expect(deleteConfig(dir)).toBe(true);
	expect(deleteConfig(dir)).toBe(false);
});

it("resolves the config dir from the environment", () => {
	expect(resolveConfigDir({ TOXIL_CONFIG_DIR: "/custom" })).toBe("/custom");
	expect(
		resolveConfigDir({ TOXIL_CONFIG_DIR: "/custom", XDG_CONFIG_HOME: "/xdg" }),
	).toBe("/custom");
	expect(resolveConfigDir({ XDG_CONFIG_HOME: "/xdg" })).toBe(
		path.join("/xdg", "toxil"),
	);
	expect(resolveConfigDir({})).toBe(
		path.join(os.homedir(), ".config", "toxil"),
	);
});
