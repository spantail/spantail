/**
 * Bootstrap `apps/web/.dev.vars` for local development.
 *
 * The auth layer fails closed when `BETTER_AUTH_SECRET` is missing or weak
 * (see `apps/web/src/server/auth.ts`), so a fresh clone cannot even start the
 * dev server — and that blocks trying the instance onboarding flow from an
 * empty database. This runs as the `predev` hook: if `.dev.vars` does not yet
 * exist, it copies `.dev.vars.example` and fills in a strong random secret.
 *
 * It never touches an existing `.dev.vars` (idempotent, non-destructive) and is
 * development-only — production keeps its fail-closed behaviour untouched and
 * sets the secret via `wrangler secret`.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, "..", "apps", "web");
const target = join(webDir, ".dev.vars");
const example = join(webDir, ".dev.vars.example");

if (existsSync(target)) {
	process.exit(0);
}
if (!existsSync(example)) {
	// Nothing to seed from; leave the env exactly as the developer left it.
	process.exit(0);
}

// 32 random bytes → 44-char base64 string, matching `openssl rand -base64 32`
// and comfortably above the 32-char minimum enforced by assertAuthSecret.
const secret = randomBytes(32).toString("base64");
const content = readFileSync(example, "utf8").replace(
	/^BETTER_AUTH_SECRET=.*$/m,
	`BETTER_AUTH_SECRET=${secret}`,
);
writeFileSync(target, content);
console.log(
	"[ensure-dev-vars] created apps/web/.dev.vars with a generated BETTER_AUTH_SECRET",
);
