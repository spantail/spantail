import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

import { clearOutbox } from "../src/server/lib/mail/mailer";
import { resetTestState } from "./helpers";

// The Workers pool no longer isolates storage per test; reset all bindings
// and re-apply migrations so every test starts from an empty, migrated D1.
beforeEach(async () => {
	await reset();
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	// Clear module-level helper state (e.g. the bootstrap admin cookie) so each
	// test re-bootstraps against its fresh database.
	resetTestState();
	clearOutbox();
});
