import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
	DEFAULT_DATASET,
	localeForDataset,
	resolveSeedDataDir,
} from "./dataset";
import { ensureTmpDir, seedR2Dir, wranglerLocal } from "./exec";
import { generateDataset } from "./generate";
import { datasetToSql } from "./to-sql";

// All committed R2 seed assets are WebP (see examples/<name>/r2/README.md).
const R2_BUCKET = "spantail-uploads";

/** Absolute paths of every file under `dir`, recursively. */
function listFilesRecursive(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listFilesRecursive(full));
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

/**
 * Uploads a dataset's committed R2 assets into the local Miniflare bucket so
 * seeded avatars/logos render in local dev, keyed by their path under r2/ (which
 * mirrors the bucket 1:1). No-op for datasets without an r2/ directory.
 */
function seedR2Objects(name: string): void {
	const r2Dir = seedR2Dir(name);
	if (!existsSync(r2Dir)) return;
	const files = listFilesRecursive(r2Dir);
	if (files.length === 0) return;
	console.log(
		`\nUploading ${files.length} R2 object(s) to local bucket "${R2_BUCKET}"…`,
	);
	for (const file of files) {
		const key = relative(r2Dir, file).split(/[\\/]/).join("/");
		wranglerLocal([
			"r2",
			"object",
			"put",
			`${R2_BUCKET}/${key}`,
			"--local",
			"--file",
			file,
			"--content-type",
			"image/webp",
		]);
	}
}

async function main(): Promise<void> {
	// `pnpm db:seed <name>` forwards the name here; default to the demo dataset.
	const name = process.argv[2] ?? DEFAULT_DATASET;
	const dataDir = resolveSeedDataDir(name);

	const dataset = await generateDataset(
		new Date(),
		dataDir,
		localeForDataset(name),
		name,
	);
	const tmp = ensureTmpDir();

	const sqlPath = join(tmp, "seed.sql");
	writeFileSync(sqlPath, datasetToSql(dataset.tables), "utf8");

	console.log(`Seeding local D1 (DB) from dataset "${name}"…`);
	for (const [table, count] of Object.entries(dataset.summary)) {
		console.log(`  ${table}: ${count}`);
	}
	wranglerLocal(["d1", "execute", "DB", "--local", "--file", sqlPath]);

	seedR2Objects(name);

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
