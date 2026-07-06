import path from "node:path";
import { defineConfig } from "vitest/config";

// Client (SPA) component tests run in happy-dom, separate from the Workers
// pool project that covers the server side.
export default defineConfig({
	// The app build injects the version (see vite.config.ts); tests that render
	// the About section need the same global.
	define: {
		__APP_VERSION__: JSON.stringify("v0.0.0-test"),
	},
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
