import { Link, useRouterState } from "@tanstack/react-router";
import { ClockIcon, FileTextIcon, HomeIcon, SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
	useSidebar,
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

// Rarely-used management screens hide behind a single cog button to keep
// the sidebar quiet.
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

function ManageMenu() {
	const { t } = useTranslation();
	const { isMobile } = useSidebar();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							isActive={MANAGE_ITEMS.some((item) => item.to === pathname)}
							tooltip={t("nav.groupManage")}
						>
							<SettingsIcon />
							<span>{t("nav.groupManage")}</span>
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="min-w-48 rounded-lg"
						align="end"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						{MANAGE_ITEMS.map((item) => (
							<DropdownMenuItem key={item.key} asChild>
								<Link to={item.to}>
									<item.icon />
									{t(item.key)}
								</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<WorkspaceSwitcher isAdmin={isAdmin} />
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<NavItems items={MAIN_ITEMS} />
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<ManageMenu />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
