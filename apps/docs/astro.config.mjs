// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightSidebarTopics from "starlight-sidebar-topics";
import starlightThemeNova from "starlight-theme-nova";

// The top bar carries audiences only (User Guide / Workspace Admin /
// Self-Hosting) plus the API Reference. Content types (CLI, MCP, Claude Plugin,
// reports, …) live as sidebar sub-topics under the relevant audience.
export default defineConfig({
	site: "https://docs.spantail.com",
	integrations: [
		starlight({
			title: "Spantail",
			customCss: ["./src/styles/custom.css"],
			locales: {
				root: { label: "English", lang: "en" },
				ja: { label: "日本語", lang: "ja" },
			},
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/spantail/spantail",
				},
			],
			plugins: [
				// Audiences switch from the top bar. User Guide is reached via the
				// logo / landing page, so only the other three are listed here.
				starlightThemeNova({
					nav: [
						{
							label: { root: "Workspace Admin", ja: "ワークスペース管理" },
							href: { root: "/workspace-admin/", ja: "/ja/workspace-admin/" },
						},
						{
							label: { root: "Self-Hosting", ja: "セルフホスティング" },
							href: { root: "/self-hosting/", ja: "/ja/self-hosting/" },
						},
						{
							label: { root: "API Reference", ja: "API リファレンス" },
							href: { root: "/api/", ja: "/ja/api/" },
						},
					],
				}),
				// Kept only to drive per-audience sidebars; its in-sidebar switcher
				// is hidden via custom.css (the top-bar nav is the single switcher).
				starlightSidebarTopics([
					{
						label: { en: "User Guide", ja: "ユーザーガイド" },
						link: "/guides/",
						icon: "open-book",
						items: [
							{ slug: "guides" },
							{ slug: "guides/logging-work" },
							{ slug: "guides/projects-timeline" },
							{ slug: "guides/reports" },
							{ slug: "guides/capturing-agents" },
							{ slug: "guides/account-preferences" },
							{
								label: "Tools & automation",
								translations: { ja: "ツールと自動化" },
								items: [
									{ slug: "guides/tools/cli" },
									{ slug: "guides/tools/mcp" },
									{ slug: "guides/tools/claude-plugin" },
								],
							},
						],
					},
					{
						label: { en: "Workspace Admin", ja: "ワークスペース管理" },
						link: "/workspace-admin/",
						icon: "setting",
						items: [
							{ slug: "workspace-admin" },
							{ slug: "workspace-admin/settings" },
							{ slug: "workspace-admin/projects" },
							{ slug: "workspace-admin/members" },
						],
					},
					{
						label: { en: "Self-Hosting", ja: "セルフホスティング" },
						link: "/self-hosting/",
						icon: "rocket",
						items: [
							{ slug: "self-hosting" },
							{ slug: "self-hosting/deploy" },
							{ slug: "self-hosting/configuration" },
							{ slug: "self-hosting/bootstrap-users" },
							{ slug: "self-hosting/system-settings" },
							{ slug: "self-hosting/user-management" },
							{ slug: "self-hosting/report-templates" },
							{ slug: "self-hosting/security" },
						],
					},
					{
						label: { en: "API Reference", ja: "API リファレンス" },
						link: "/api/",
						icon: "seti:json",
						items: [
							{ slug: "api" },
							{ slug: "api/workspaces-members" },
							{ slug: "api/work-entries" },
							{ slug: "api/agents-ingest" },
							{ slug: "api/reports" },
							{ slug: "api/inbox-realtime" },
							{ slug: "api/instance" },
						],
					},
				]),
			],
		}),
	],
});
