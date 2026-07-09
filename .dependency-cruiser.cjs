/**
 * dependency-cruiser rules — machine-check the architecture invariants from docs/conventions.md.
 * Run via `pnpm depcruise` (part of `pnpm quality`).
 */
module.exports = {
	forbidden: [
		{
			name: "no-circular",
			severity: "error",
			comment:
				"Circular dependencies make the module graph hard to reason about and break tree-shaking.",
			from: {},
			to: { circular: true },
		},
		{
			name: "core-is-runtime-agnostic",
			severity: "error",
			comment:
				"packages/core is runtime-agnostic domain logic: no Workers/DOM/framework/data-access APIs (docs/conventions.md).",
			from: { path: "^packages/core/src" },
			to: {
				path: "node_modules/(hono|react|react-dom|better-auth|agents|drizzle-orm)/",
			},
		},
		{
			name: "core-is-the-lowest-layer",
			severity: "error",
			comment:
				"db/sdk/cli depend on core, never the reverse (docs/conventions.md dependency direction).",
			from: { path: "^packages/core/src" },
			to: { path: "^packages/(db|sdk|cli)/src" },
		},
		{
			name: "client-must-not-import-server",
			severity: "error",
			comment:
				"The SPA talks to the Worker only through the typed API client, never by importing server code (docs/conventions.md).",
			from: { path: "^apps/web/src/client" },
			to: { path: "^apps/web/src/server" },
		},
		{
			name: "routes-go-through-db-queries",
			severity: "error",
			comment:
				"Route handlers use @spantail/db query functions, not inline drizzle-orm calls (docs/conventions.md data access).",
			from: { path: "^apps/web/src/server/routes" },
			to: { path: "node_modules/drizzle-orm/" },
		},
	],
	options: {
		doNotFollow: { path: "node_modules" },
		// Type-only imports are erased at build time and are not runtime coupling, so they
		// are excluded: the invariants here are about the runtime module graph, and this
		// avoids false circular hits from barrel `import type` re-exports (e.g. db queries).
		tsPreCompilationDeps: false,
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			conditionNames: ["import", "require", "node", "default", "types"],
			extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
		},
	},
};
