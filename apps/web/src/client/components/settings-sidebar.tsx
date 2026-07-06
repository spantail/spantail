import { Link, useRouterState } from "@tanstack/react-router";
import {
	FileTextIcon,
	FingerprintIcon,
	FolderIcon,
	InfoIcon,
	KeyIcon,
	LayersIcon,
	PlugIcon,
	SettingsIcon,
	ShieldIcon,
	SlidersHorizontalIcon,
	TerminalIcon,
	ZapIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { GitHubIcon } from "@/components/provider-icons";
import { RailHeader } from "@/components/rail-header";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@/components/ui/sidebar";

// Sections of the Settings takeover, grouped by scope: workspace-scoped
// settings, report templates, the user-scoped account section, then an
// instance-admin-only system section.
interface SettingsNavItem {
	to:
		| "/settings/general"
		| "/settings/projects"
		| "/settings/members"
		| "/settings/integrations"
		| "/settings/templates"
		| "/settings/tokens"
		| "/settings/agents"
		| "/settings/preferences"
		| "/settings/authentication"
		| "/settings/users"
		| "/settings/features"
		| "/settings/github"
		| "/settings/system";
	labelKey: string;
	icon: React.ComponentType<{ className?: string }>;
	/** Hidden unless the instance has the agents feature enabled. */
	requiresAgents?: boolean;
	/**
	 * Overrides the group's visibility for this item. "public" shows it to
	 * everyone even inside an admin-only group (e.g. system info under System).
	 */
	visibility?: "admin" | "public";
}

interface SettingsNavGroup {
	labelKey: string;
	items: SettingsNavItem[];
	/**
	 * Default visibility gate for the group's items. "admin" shows only to
	 * instance admins; "templateManager" shows to instance admins or users with
	 * the template-author capability. An item may override this.
	 */
	visibility?: "admin" | "templateManager";
}

const GROUPS: SettingsNavGroup[] = [
	{
		labelKey: "settings.nav.workspace",
		items: [
			{
				to: "/settings/general",
				labelKey: "settings.nav.general",
				icon: SettingsIcon,
			},
			{
				to: "/settings/projects",
				labelKey: "settings.nav.projects",
				icon: FolderIcon,
			},
			{
				to: "/settings/members",
				labelKey: "settings.nav.members",
				icon: LayersIcon,
			},
			{
				to: "/settings/integrations",
				labelKey: "settings.nav.integrations",
				icon: PlugIcon,
			},
		],
	},
	{
		labelKey: "settings.nav.reporting",
		visibility: "templateManager",
		items: [
			{
				to: "/settings/templates",
				labelKey: "settings.nav.templates",
				icon: FileTextIcon,
			},
		],
	},
	{
		labelKey: "settings.nav.account",
		items: [
			{
				to: "/settings/preferences",
				labelKey: "settings.nav.preferences",
				icon: SlidersHorizontalIcon,
			},
			{
				to: "/settings/authentication",
				labelKey: "settings.nav.authentication",
				icon: FingerprintIcon,
			},
			{
				to: "/settings/tokens",
				labelKey: "settings.nav.tokens",
				icon: KeyIcon,
			},
			{
				to: "/settings/agents",
				labelKey: "settings.nav.agents",
				icon: TerminalIcon,
				requiresAgents: true,
			},
		],
	},
	{
		labelKey: "settings.nav.system",
		visibility: "admin",
		items: [
			{
				to: "/settings/users",
				labelKey: "settings.nav.systemUsers",
				icon: ShieldIcon,
			},
			{
				to: "/settings/features",
				labelKey: "settings.nav.features",
				icon: ZapIcon,
			},
			{
				to: "/settings/github",
				labelKey: "settings.nav.github",
				icon: GitHubIcon,
			},
			{
				to: "/settings/system",
				labelKey: "settings.nav.systemAbout",
				icon: InfoIcon,
				visibility: "public",
			},
		],
	},
];

/** The i18n label key for the settings section a pathname belongs to, if any. */
export function settingsSectionLabelKey(pathname: string): string | undefined {
	for (const group of GROUPS) {
		for (const item of group.items) {
			if (item.to === pathname) return item.labelKey;
		}
	}
	return undefined;
}

export function SettingsSidebar({
	isAdmin,
	canManageTemplates,
	agentsEnabled,
}: {
	isAdmin: boolean;
	canManageTemplates: boolean;
	agentsEnabled: boolean;
}) {
	const { t } = useTranslation();
	const { setOpenMobile } = useSidebar();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	const itemVisible = (
		item: SettingsNavItem,
		group: SettingsNavGroup,
	): boolean => {
		if (item.requiresAgents && !agentsEnabled) return false;
		// An item's own visibility overrides the group's default.
		const visibility = item.visibility ?? group.visibility;
		if (visibility === "admin") return isAdmin;
		if (visibility === "templateManager") return isAdmin || canManageTemplates;
		return true;
	};

	const visibleItems = (group: SettingsNavGroup): SettingsNavItem[] =>
		group.items.filter((item) => itemVisible(item, group));

	return (
		<Sidebar collapsible="icon">
			<RailHeader
				title={t("settings.title")}
				closeLabel={t("settings.rail.close")}
			/>
			<SidebarContent>
				{GROUPS.filter((group) => visibleItems(group).length > 0).map(
					(group) => (
						<SidebarGroup key={group.labelKey}>
							<SidebarGroupLabel className="text-[11px] tracking-wider uppercase">
								{t(group.labelKey)}
							</SidebarGroupLabel>
							<SidebarMenu>
								{visibleItems(group).map((item) => (
									<SidebarMenuItem key={item.to}>
										<SidebarMenuButton
											asChild
											isActive={pathname === item.to}
											tooltip={t(item.labelKey)}
											className="h-9"
											onClick={() => setOpenMobile(false)}
										>
											<Link to={item.to}>
												<item.icon />
												<span>{t(item.labelKey)}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroup>
					),
				)}
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
