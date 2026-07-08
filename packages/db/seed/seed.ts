import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	availableDatasets,
	ensureTmpDir,
	seedDataDir,
	wranglerLocal,
} from "./exec";
import { generateDataset } from "./generate";
import type { Language } from "./schema";
import { datasetToSql } from "./to-sql";

const DEFAULT_DATASET = "demo";

/** A dataset whose name ends with "-ja" is Japanese; all others English. */
function localeForDataset(name: string): Language {
	return name.endsWith("-ja") ? "ja" : "en";
}

async function main(): Promise<void> {
	// `pnpm db:seed <name>` forwards the name here; default to the demo dataset.
	const name = process.argv[2] ?? DEFAULT_DATASET;
	// A dataset name is a single directory under examples/ — reject path
	// separators / traversal / absolute paths so it can't load YAML elsewhere.
	// Lowercase-only: on case-insensitive filesystems an uppercased name could
	// resolve to a directory yet bypass the `-ja` locale check below.
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

	const dataset = await generateDataset(
		new Date(),
		dataDir,
		localeForDataset(name),
	);
	const tmp = ensureTmpDir();

	const sqlPath = join(tmp, "seed.sql");
	writeFileSync(sqlPath, datasetToSql(dataset.tables), "utf8");

	console.log(`Seeding local D1 (DB) from dataset "${name}"…`);
	for (const [table, count] of Object.entries(dataset.summary)) {
		console.log(`  ${table}: ${count}`);
	}
	wranglerLocal(["d1", "execute", "DB", "--local", "--file", sqlPath]);

	console.log("\nSeed complete. Sign in with any email + password below:");
	const pad = Math.max(...dataset.credentials.map((c) => c.email.length));
	for (const { name, email, password } of dataset.credentials) {
		console.log(`  ${email.padEnd(pad)}  ${password}  (${name})`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
