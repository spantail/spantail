import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

// The Workers pool no longer isolates storage per test; reset all bindings
// and re-apply migrations so every test starts from an empty, migrated D1.
beforeEach(async () => {
	await reset();
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
