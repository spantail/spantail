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
		setupFiles: ["./test/apply-migrations.ts"],
	},
	plugins: [
		cloudflareTest(async () => ({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations(migrationsDir),
				},
			},
		})),
	],
});
