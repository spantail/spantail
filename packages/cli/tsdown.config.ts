import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	platform: "node",
	// Workspace packages are TypeScript source; bundle them into the binary.
	noExternal: [/^@spantail\//],
	dts: false,
});
