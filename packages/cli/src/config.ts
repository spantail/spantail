import {
	chmodSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { slugSchema } from "@toxil/core";
import { z } from "zod";

import { CliError } from "./errors";

export const configSchema = z.object({
	baseUrl: z.url(),
	// The token is stored in plaintext at mode 0600, like ~/.npmrc.
	token: z.string().min(1),
	defaultWorkspace: slugSchema.optional(),
});
export type CliConfig = z.infer<typeof configSchema>;

/**
 * Resolves the directory holding config.json:
 * $TOXIL_CONFIG_DIR > $XDG_CONFIG_HOME/toxil > ~/.config/toxil.
 */
export function resolveConfigDir(
	env: Record<string, string | undefined>,
): string {
	if (env.TOXIL_CONFIG_DIR) return env.TOXIL_CONFIG_DIR;
	const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
	return path.join(base, "toxil");
}

export function configPath(configDir: string): string {
	return path.join(configDir, "config.json");
}

/** Returns null when no config file exists; throws CliError when unreadable. */
export function loadConfig(configDir: string): CliConfig | null {
	const file = configPath(configDir);
	let raw: string;
	try {
		raw = readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = undefined;
	}
	const result = configSchema.safeParse(parsed);
	if (!result.success) {
		throw new CliError(
			`invalid config file at ${file}; run \`toxil auth login\` to recreate it`,
		);
	}
	return result.data;
}

export function saveConfig(configDir: string, config: CliConfig): void {
	mkdirSync(configDir, { recursive: true, mode: 0o700 });
	const file = configPath(configDir);
	writeFileSync(file, `${JSON.stringify(config, null, "\t")}\n`, {
		mode: 0o600,
	});
	// writeFileSync applies the mode only on creation; repair pre-existing files.
	chmodSync(file, 0o600);
}

/** Removes the config file; returns whether one existed. */
export function deleteConfig(configDir: string): boolean {
	try {
		rmSync(configPath(configDir));
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}
