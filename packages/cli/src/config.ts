import os from "node:os";
import path from "node:path";

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
