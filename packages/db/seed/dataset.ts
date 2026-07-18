import { existsSync } from "node:fs";

import { availableDatasets, seedDataDir } from "./exec";
import type { Language } from "./schema";

export const DEFAULT_DATASET = "demo";

/** A dataset whose name ends with "-ja" is Japanese; all others English. */
export function localeForDataset(name: string): Language {
	return name.endsWith("-ja") ? "ja" : "en";
}

/**
 * Validates a dataset name and returns its seed YAML directory. A dataset name
 * is a single directory under examples/ — reject path separators / traversal /
 * absolute paths so it can't load YAML elsewhere. Lowercase-only: on
 * case-insensitive filesystems an uppercased name could resolve to a directory
 * yet bypass the `-ja` locale check.
 */
export function resolveSeedDataDir(name: string): string {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
		throw new Error(
			`Invalid seed dataset name "${name}": use lowercase letters, digits and hyphens only.`,
		);
	}
	const dataDir = seedDataDir(name);
	if (!existsSync(dataDir)) {
		const choices = availableDatasets();
		const hint = choices.length
			? `Available datasets: ${choices.join(", ")}`
			: "No datasets found under examples/.";
		throw new Error(`Unknown seed dataset "${name}" (${dataDir}).\n${hint}`);
	}
	return dataDir;
}
