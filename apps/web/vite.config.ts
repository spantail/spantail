import { execSync } from "node:child_process";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The running instance's product version, resolved from git at build time. The
// `vX.Y.Z` tag is the source of truth (see docs/releasing.md); on a clean tag
// `git describe` yields e.g. "v0.1.0", off-tag "v0.1.0-7-gfe9cc5b". Builds
// without git history fall back to "unknown".
function resolveAppVersion(): string {
	try {
		return execSync("git describe --tags --always --dirty", {
			encoding: "utf8",
		}).trim();
	} catch {
		return "unknown";
	}
}

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(resolveAppVersion()),
	},
	resolve: {
		// The @/ alias must be declared here as well as in tsconfig paths:
		// the build resolver reads tsconfig, but the dev server does not.
		alias: {
			"@": path.resolve(import.meta.dirname, "./src/client"),
		},
	},
	plugins: [
		// tanstackRouter must run before react().
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
			routesDirectory: "./src/client/routes",
			generatedRouteTree: "./src/client/routeTree.gen.ts",
		}),
		react(),
		tailwindcss(),
		cloudflare(),
	],
});
