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
				// The R2 binding comes from wrangler.jsonc, but the Workers pool
				// needs it declared here too or c.env.SHARE_BUCKET is undefined.
				r2Buckets: ["SHARE_BUCKET"],
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations(migrationsDir),
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
