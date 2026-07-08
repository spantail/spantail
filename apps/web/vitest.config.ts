import path from "node:path";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrationsDir = path.join(
	import.meta.dirname,
	"../../packages/db/migrations",
);

export default defineConfig({
	test: {
		name: "web",
		include: ["src/server/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
	plugins: [
		cloudflareTest(async () => ({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				// Shrink the ingest rate limit so a test can exhaust it in a few
				// requests; production uses the higher limit from wrangler.jsonc.
				// Keys are per-credential with fresh ids each test, so no existing
				// test posts enough to one key to trip this.
				ratelimits: {
					INGEST_RATE_LIMITER: { simple: { limit: 10, period: 60 } },
				},
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations(migrationsDir),
					// Pin the app env so tests always use the in-memory dev outbox,
					// independent of the deploy-time APP_ENV in wrangler.jsonc.
					APP_ENV: "development",
					// Tests must not depend on .dev.vars (absent in CI).
					BETTER_AUTH_SECRET: "vitest-only-secret-0123456789abcdefghijklmn",
					BETTER_AUTH_URL: "https://example.com",
					// Google is "configured" in tests; GitHub is forced empty so the
					// "enable without credentials" path is exercised deterministically
					// regardless of any local .dev.vars.
					GOOGLE_OAUTH_CLIENT_ID: "vitest-google-client-id",
					GOOGLE_OAUTH_CLIENT_SECRET: "vitest-google-client-secret",
					GITHUB_OAUTH_CLIENT_ID: "",
					GITHUB_OAUTH_CLIENT_SECRET: "",
				},
			},
		})),
	],
});
