import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
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
