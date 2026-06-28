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
			logo: { src: "./src/assets/spantail-mark.svg", alt: "Spantail" },
			// Geist (sans + mono) — self-hosted via fontsource, wired into the Nova
			// theme through --font-sans / --font-mono in custom.css. The font CSS is
			// listed before custom.css so the @font-face rules load first.
			customCss: [
				"@fontsource-variable/geist",
				"@fontsource-variable/geist-mono",
				"./src/styles/custom.css",
			],
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
							href: { root: "/admin/", ja: "/ja/admin/" },
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
						// Two always-expanded groups (Core features, Your account) plus
						// standalone top items: Getting started, and the three tool
						// clients (CLI/MCP/Claude Plugin) lifted up one level rather than
						// nested under a Tools group. Group `collapsed: false` keeps the
						// tree open on load. Group labels use Starlight's `label` +
						// `translations`; the topic label above uses the plugin's own
						// `{ en, ja }` shape — two different schemas, both intentional.
						items: [
							{ slug: "guides" },
							{
								label: "Core features",
								translations: { ja: "基本機能" },
								collapsed: false,
								items: [
									{ slug: "guides/logging-work" },
									{ slug: "guides/projects-timeline" },
									{ slug: "guides/reports" },
									{ slug: "guides/capturing-agents" },
								],
							},
							{
								label: "Your account",
								translations: { ja: "アカウント" },
								collapsed: false,
								items: [
									{ slug: "guides/account-preferences" },
									{ slug: "guides/keyboard-shortcuts" },
								],
							},
							{ slug: "guides/tools/cli" },
							{ slug: "guides/tools/mcp" },
							{ slug: "guides/tools/claude-plugin" },
						],
					},
					{
						label: { en: "Admin Guide", ja: "管理者ガイド" },
						link: "/admin/",
						icon: "setting",
						items: [
							{ slug: "admin" },
							{
								label: "Workspace",
								translations: { ja: "ワークスペース" },
								items: [
									{ slug: "admin/workspace-settings" },
									{ slug: "admin/projects" },
									{ slug: "admin/members" },
								],
							},
							{
								label: "Instance",
								translations: { ja: "インスタンス" },
								items: [
									{ slug: "admin/users" },
									{ slug: "admin/system-settings" },
									{ slug: "admin/report-templates" },
								],
							},
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
							{ slug: "self-hosting/setup-wizard" },
							{ slug: "self-hosting/security" },
						],
					},
					{
						label: { en: "API Reference", ja: "API リファレンス" },
						link: "/api/",
						icon: "seti:json",
						items: [
							{
								label: "Getting started",
								translations: { ja: "はじめに" },
								items: [
									{ slug: "api" },
									{ slug: "api/authentication" },
									{ slug: "api/account" },
								],
							},
							{
								label: "Workspaces",
								translations: { ja: "ワークスペース" },
								items: [
									{ slug: "api/workspaces" },
									{ slug: "api/members" },
									{ slug: "api/projects" },
								],
							},
							{
								label: "Activity",
								translations: { ja: "アクティビティ" },
								items: [
									{ slug: "api/work-entries" },
									{ slug: "api/agents" },
									{ slug: "api/agent-ingest" },
								],
							},
							{
								label: "Reports",
								translations: { ja: "レポート" },
								items: [
									{ slug: "api/reports" },
									{ slug: "api/report-sharing" },
									{ slug: "api/report-templates" },
								],
							},
							{
								label: "Notifications",
								translations: { ja: "通知" },
								items: [{ slug: "api/inbox-realtime" }],
							},
							{
								label: "Administration",
								translations: { ja: "管理" },
								items: [
									{ slug: "api/users-invitations" },
									{ slug: "api/instance" },
								],
							},
						],
					},
				]),
			],
		}),
	],
});
