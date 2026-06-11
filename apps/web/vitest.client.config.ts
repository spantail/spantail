import path from "node:path";
import { defineConfig } from "vitest/config";

// Client (SPA) component tests run in happy-dom, separate from the Workers
// pool project that covers the server side.
export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "./src/client"),
		},
	},
	test: {
		name: "web-client",
		environment: "happy-dom",
		include: ["src/client/**/*.test.{ts,tsx}"],
	},
});
