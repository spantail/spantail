import { Link, useRouterState } from "@tanstack/react-router";
import {
	FileTextIcon,
	FolderIcon,
	KeyIcon,
	SettingsIcon,
	UsersIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

// Sections of the Settings hub, grouped by scope. Mirrors the design's
// SubNav: workspace-scoped settings, then the user-scoped account section.
interface SettingsNavItem {
	to:
		| "/settings/general"
		| "/settings/projects"
		| "/settings/members"
		| "/settings/templates"
		| "/settings/tokens";
	labelKey: string;
	icon: React.ComponentType<{ className?: string }>;
}

interface SettingsNavGroup {
	labelKey: string;
	items: SettingsNavItem[];
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
				to: "/settings/tokens",
				labelKey: "settings.nav.tokens",
				icon: KeyIcon,
			},
		],
	},
];

export function SettingsNav() {
	const { t } = useTranslation();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<nav className="flex shrink-0 flex-col gap-5 md:w-48">
			{GROUPS.map((group) => (
				<div key={group.labelKey} className="flex flex-col gap-1">
					<p className="text-muted-foreground px-2 pb-1 text-xs font-medium uppercase tracking-wider">
						{t(group.labelKey)}
					</p>
					{group.items.map((item) => {
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
