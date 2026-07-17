import { writeFileSync } from "node:fs";

import {
	DEFAULT_DATASET,
	localeForDataset,
	resolveSeedDataDir,
} from "./dataset";
import { generateDataset } from "./generate";
import { datasetToSql } from "./to-sql";

/**
 * `pnpm db:seed:sql <name> [--out <file>]` — writes a dataset's seed SQL to
 * stdout (or `--out <file>`). A pure transformation: it never touches a database
 * or R2. Generation is deterministic apart from relative dates (derived from the
 * current time, as `pnpm db:seed` is), so applying the SQL to an empty, migrated
 * D1 reproduces the seed. Every statement stays within D1's per-statement size
 * limit (see to-sql.ts). R2 assets are separate — sync `examples/<name>/r2/`.
 */
async function main(): Promise<void> {
	const args = process.argv.slice(2);
	let name = DEFAULT_DATASET;
	let out: string | null = null;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--out") {
			out = args[++i] ?? null;
			if (!out) throw new Error("--out requires a file path");
		} else {
			name = arg as string;
		}
	}

	const dataDir = resolveSeedDataDir(name);
	const dataset = await generateDataset(
		new Date(),
		dataDir,
		localeForDataset(name),
		name,
	);
	const sql = datasetToSql(dataset.tables);

	if (out) {
		writeFileSync(out, sql, "utf8");
		// Diagnostics on stderr so `--out` and stdout stay clean.
		console.error(`Wrote seed SQL for "${name}" to ${out}`);
	} else {
		process.stdout.write(sql);
	}
	console.error(
		`\nApply with: wrangler d1 execute <DB> --file <sql>. ` +
			`For avatars/logos, also sync examples/${name}/r2/ to the uploads bucket.`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
