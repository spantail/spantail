import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

/** Monorepo root (…/packages/db/seed/ → up three). */
export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** Root holding the example datasets (one directory per dataset). */
const examplesRoot = join(repoRoot, "examples");

/** Directory holding a named dataset's seed YAML files. */
export function seedDataDir(name: string): string {
	return join(examplesRoot, name, "db/seed");
}

/**
 * Directory holding a dataset's R2 assets, laid out to mirror the bucket's key
 * structure 1:1 (`avatars/<userId>`, `workspaces/<id>/logo`) so a single
 * S3-compatible `sync` reproduces the bucket. May not exist.
 */
export function seedR2Dir(name: string): string {
	return join(examplesRoot, name, "r2");
}

/** Dataset names: examples/<name> directories that hold seed YAML. */
export function availableDatasets(): string[] {
	if (!existsSync(examplesRoot)) return [];
	return readdirSync(examplesRoot, { withFileTypes: true })
		.filter((e) => e.isDirectory() && existsSync(seedDataDir(e.name)))
		.map((e) => e.name)
		.sort();
}

/** Scratch dir for generated SQL / share bodies (gitignored). */
export const tmpDir = fileURLToPath(new URL("./.tmp/", import.meta.url));

export function ensureTmpDir(): string {
	mkdirSync(tmpDir, { recursive: true });
	return tmpDir;
}

/**
 * Runs wrangler against the local Miniflare state used by `pnpm dev`. Routed
 * through `pnpm --filter web exec` so it picks up apps/web/wrangler.jsonc.
 */
export function wranglerLocal(args: string[]): void {
	execFileSync("pnpm", ["--filter", "web", "exec", "wrangler", ...args], {
		cwd: repoRoot,
		stdio: "inherit",
	});
}
