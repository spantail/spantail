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
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations(migrationsDir),
					// Tests must not depend on .dev.vars (absent in CI).
					BETTER_AUTH_SECRET: "vitest-only-secret-0123456789abcdefghijklmn",
					BETTER_AUTH_URL: "https://example.com",
				},
			},
		})),
	],
});
