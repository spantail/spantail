import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "./exec";

// Local Miniflare state used by `pnpm dev` and `wrangler ... --local`. Removing
// this directory drops all local D1 tables; the next `db:migrate:local`
// recreates the schema from scratch. Local-only by design.
const STATE = join(repoRoot, "apps/web/.wrangler/state/v3");
const TARGETS = ["d1"];

function main(): void {
	for (const name of TARGETS) {
		const dir = join(STATE, name);
		if (existsSync(dir)) {
			rmSync(dir, { recursive: true, force: true });
			console.log(`Dropped local ${name} state (${dir})`);
		} else {
			console.log(`No local ${name} state to drop (${dir})`);
		}
	}
}

main();
