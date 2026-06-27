// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightSidebarTopics from "starlight-sidebar-topics";
import starlightThemeNova from "starlight-theme-nova";

// The top bar switches audience: User Guide, Admin Guide, Setup Guide, and the
// API Reference (the logo/home also lands on User Guide). Content types (CLI,
// MCP, Claude Plugin, reports, …) are sidebar items under the relevant audience.
export default defineConfig({
	site: "https://docs.spantail.com",
	integrations: [
		starlight({
			title: "Spantail docs",
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
				// Audiences switch from the top bar. User Guide is listed first (and
				// is also where the logo / landing page leads) so the switcher is
				// obvious and the logo's destination isn't a hidden assumption.
				starlightThemeNova({
					nav: [
						{
							label: { root: "User Guide", ja: "ユーザーガイド" },
							href: { root: "/guides/", ja: "/ja/guides/" },
						},
						{
							label: { root: "Admin Guide", ja: "管理者ガイド" },
							href: { root: "/workspace-admin/", ja: "/ja/workspace-admin/" },
						},
						{
							label: { root: "Setup Guide", ja: "セットアップガイド" },
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
							{ slug: "guides/keyboard-shortcuts" },
							{ slug: "guides/tools/cli" },
							{ slug: "guides/tools/mcp" },
							{ slug: "guides/tools/claude-plugin" },
						],
					},
					{
						label: { en: "Admin Guide", ja: "管理者ガイド" },
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
						label: { en: "Setup Guide", ja: "セットアップガイド" },
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
