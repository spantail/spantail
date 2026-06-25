import { Link, useRouterState } from "@tanstack/react-router";
import {
	BotIcon,
	FileTextIcon,
	FingerprintIcon,
	FolderIcon,
	KeyIcon,
	KeyRoundIcon,
	MailIcon,
	PaletteIcon,
	SettingsIcon,
	ShieldIcon,
	SlidersHorizontalIcon,
	UserCircleIcon,
	UsersIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

// Sections of the Settings hub, grouped by scope. Mirrors the design's
// SubNav: workspace-scoped settings, then the user-scoped account section,
// then an instance-admin-only system section.
interface SettingsNavItem {
	to:
		| "/settings/general"
		| "/settings/projects"
		| "/settings/members"
		| "/settings/appearance"
		| "/settings/templates"
		| "/settings/tokens"
		| "/settings/agents"
		| "/settings/profile"
		| "/settings/authentication"
		| "/settings/preferences"
		| "/settings/users"
		| "/settings/agents-admin"
		| "/settings/email"
		| "/settings/oauth";
	labelKey: string;
	icon: React.ComponentType<{ className?: string }>;
	/** Hidden unless the instance has the agents feature enabled. */
	requiresAgents?: boolean;
}

interface SettingsNavGroup {
	labelKey: string;
	items: SettingsNavItem[];
	/**
	 * Visibility gate. "admin" shows only to instance admins; "templateManager"
	 * shows to instance admins or users with the template-author capability.
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
				icon: UsersIcon,
			},
			{
				to: "/settings/appearance",
				labelKey: "settings.nav.appearance",
				icon: PaletteIcon,
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
				to: "/settings/profile",
				labelKey: "settings.nav.profile",
				icon: UserCircleIcon,
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
				icon: BotIcon,
				requiresAgents: true,
			},
			{
				to: "/settings/preferences",
				labelKey: "settings.nav.preferences",
				icon: SlidersHorizontalIcon,
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
				to: "/settings/agents-admin",
				labelKey: "settings.nav.systemAgents",
				icon: BotIcon,
			},
			{
				to: "/settings/email",
				labelKey: "settings.nav.email",
				icon: MailIcon,
			},
			{
				to: "/settings/oauth",
				labelKey: "settings.nav.oauth",
				icon: KeyRoundIcon,
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

export function SettingsNav({
	isAdmin,
	canManageTemplates,
	agentsEnabled,
}: {
	isAdmin: boolean;
	canManageTemplates: boolean;
	agentsEnabled: boolean;
}) {
	const { t } = useTranslation();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	const isVisible = (group: SettingsNavGroup): boolean => {
		if (group.visibility === "admin") return isAdmin;
		if (group.visibility === "templateManager")
			return isAdmin || canManageTemplates;
		return true;
	};

	const visibleItems = (group: SettingsNavGroup): SettingsNavItem[] =>
		group.items.filter((item) => !item.requiresAgents || agentsEnabled);

	return (
		<nav className="flex shrink-0 flex-col gap-5 md:w-48">
			{GROUPS.filter(isVisible)
				.filter((group) => visibleItems(group).length > 0)
				.map((group) => (
					<div key={group.labelKey} className="flex flex-col gap-1">
						<p className="text-muted-foreground px-2 pb-1 text-xs font-medium uppercase tracking-wider">
							{t(group.labelKey)}
						</p>
						{visibleItems(group).map((item) => {
							const isActive = pathname === item.to;
							return (
								<Link
									key={item.to}
									to={item.to}
									className={cn(
										"flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
										isActive
											? "bg-secondary text-foreground font-medium"
											: "text-muted-foreground hover:bg-accent hover:text-foreground",
									)}
								>
									<item.icon className="size-4" />
									{t(item.labelKey)}
								</Link>
							);
						})}
					</div>
				))}
		</nav>
	);
}
