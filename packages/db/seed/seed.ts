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

	console.log("Seeding local D1 (toxil-db)…");
	for (const [table, count] of Object.entries(dataset.summary)) {
		console.log(`  ${table}: ${count}`);
	}
	wranglerLocal(["d1", "execute", "toxil-db", "--local", "--file", sqlPath]);

	if (dataset.r2.length > 0) {
		console.log(`Uploading ${dataset.r2.length} share bodies to local R2…`);
		for (const { key, body } of dataset.r2) {
			const bodyPath = join(dir, key.replace(/\//g, "_"));
			writeFileSync(bodyPath, body, "utf8");
			wranglerLocal([
				"r2",
				"object",
				"put",
				`toxil-shares/${key}`,
				"--local",
				"--file",
				bodyPath,
				"--content-type",
				"text/plain;charset=utf-8",
			]);
		}
	}

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
