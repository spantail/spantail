import { Link, useRouterState } from "@tanstack/react-router";
import type { AuthUser } from "@toxil/core";
import { HomeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { NavUser } from "@/components/nav-user";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

interface NavItem {
	key: string;
	to: "/";
	icon: React.ComponentType<{ className?: string }>;
}

// Routes appear here as their screens land (entries, settings, ...).
const NAV_ITEMS: NavItem[] = [{ key: "nav.home", to: "/", icon: HomeIcon }];

export function AppSidebar({ user }: { user: AuthUser }) {
	const { t } = useTranslation();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<WorkspaceSwitcher />
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenu>
						{NAV_ITEMS.map((item) => (
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
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
