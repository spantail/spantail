// Vite inlines `*.liquid?raw` imports as their file contents at build time. This
// ambient declaration types them for consumers whose tsconfig does not pull in
// `vite/client` (e.g. the Worker program), and is force-included via a
// triple-slash reference from index.ts.
declare module "*.liquid?raw" {
	const content: string;
	export default content;
}
