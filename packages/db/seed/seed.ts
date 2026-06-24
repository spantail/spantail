import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensureTmpDir, wranglerLocal } from "./exec";
import { generateDataset, SEED_PASSWORD } from "./generate";
import { datasetToSql } from "./to-sql";

async function main(): Promise<void> {
	const dataset = await generateDataset(new Date());
	const dir = ensureTmpDir();

	const sqlPath = join(dir, "seed.sql");
	writeFileSync(sqlPath, datasetToSql(dataset.tables), "utf8");

	console.log("Seeding local D1 (spantail-db)…");
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
