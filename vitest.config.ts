import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			"./apps/web/vitest.config.ts",
			"./apps/web/vitest.client.config.ts",
			"./packages/cli/vitest.config.ts",
			"./packages/core/vitest.config.ts",
			"./packages/db/vitest.config.ts",
			"./packages/sdk/vitest.config.ts",
			"./packages/templates/vitest.config.ts",
		],
	},
});
