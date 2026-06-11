import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			"./apps/web/vitest.config.ts",
			"./packages/core/vitest.config.ts",
			"./packages/sdk/vitest.config.ts",
		],
	},
});
