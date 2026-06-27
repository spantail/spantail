import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensureTmpDir, seedDataDir, wranglerLocal } from "./exec";
import { generateDataset, SEED_PASSWORD } from "./generate";
import { datasetToSql } from "./to-sql";

const DEFAULT_DATASET = "demo";

/** Dataset directories under examples/db/seed (for the unknown-dataset hint). */
function availableDatasets(): string[] {
	const root = seedDataDir("");
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();
}

async function main(): Promise<void> {
	// `pnpm db:seed <name>` forwards the name here; default to the demo dataset.
	const name = process.argv[2] ?? DEFAULT_DATASET;
	const dataDir = seedDataDir(name);
	if (!existsSync(dataDir)) {
		const choices = availableDatasets();
		const hint = choices.length
			? `Available datasets: ${choices.join(", ")}`
			: "No datasets found under examples/db/seed.";
		throw new Error(`Unknown seed dataset "${name}" (${dataDir}).\n${hint}`);
	}

	const dataset = await generateDataset(new Date(), dataDir);
	const tmp = ensureTmpDir();

	const sqlPath = join(tmp, "seed.sql");
	writeFileSync(sqlPath, datasetToSql(dataset.tables), "utf8");

	console.log(`Seeding local D1 (spantail-db) from dataset "${name}"…`);
	for (const [table, count] of Object.entries(dataset.summary)) {
		console.log(`  ${table}: ${count}`);
	}
	wranglerLocal(["d1", "execute", "spantail-db", "--local", "--file", sqlPath]);

	console.log("\nSeed complete. Sign in with any user below:");
	for (const { name, email } of dataset.credentials) {
		console.log(`  ${email}  (${name})`);
	}
	console.log(`  password: ${SEED_PASSWORD}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
