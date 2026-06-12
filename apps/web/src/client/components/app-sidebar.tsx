import { Link, useRouterState } from "@tanstack/react-router";
import { ClockIcon, FileTextIcon, HomeIcon, SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

interface NavItem {
	key: string;
	to: "/" | "/entries" | "/templates" | "/settings";
	icon: React.ComponentType<{ className?: string }>;
}

// The sidebar is workspace-scoped only; user-scoped surfaces (reports,
// account, user menu) live in the header's top-right corner instead.
const MAIN_ITEMS: NavItem[] = [
	{ key: "nav.home", to: "/", icon: HomeIcon },
	{ key: "nav.entries", to: "/entries", icon: ClockIcon },
];

const MANAGE_ITEMS: NavItem[] = [
	{ key: "nav.templates", to: "/templates", icon: FileTextIcon },
	{ key: "nav.settings", to: "/settings", icon: SettingsIcon },
];

function NavItems({ items }: { items: NavItem[] }) {
	const { t } = useTranslation();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<SidebarMenu>
			{items.map((item) => (
				<SidebarMenuItem key={item.key}>
					<SidebarMenuButton
						asChild
						isActive={pathname === item.to}
						tooltip={t(item.key)}
					>
						<Link to={item.to}>
							<item.icon />
							<span>{t(item.key)}</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
			))}
		</SidebarMenu>
	);
}

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
	const { t } = useTranslation();

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<WorkspaceSwitcher isAdmin={isAdmin} />
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<NavItems items={MAIN_ITEMS} />
				</SidebarGroup>
				<SidebarGroup className="mt-auto">
					<SidebarGroupLabel>{t("nav.groupManage")}</SidebarGroupLabel>
					<NavItems items={MANAGE_ITEMS} />
				</SidebarGroup>
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
