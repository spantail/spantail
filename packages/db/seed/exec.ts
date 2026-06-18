import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

/** Monorepo root (…/packages/db/seed/ → up three). */
export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

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
