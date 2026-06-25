import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRightIcon, HomeIcon, SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentTypeIcon } from "@/components/agent-icon";
import { Dot } from "@/components/dot";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarRail,
	useSidebar,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

interface NavItem {
	key: string;
	to: "/";
	icon: React.ComponentType<{ className?: string }>;
}

// The sidebar is workspace-scoped only; user-scoped surfaces (reports,
// account, user menu) live in the header's top-right corner instead.
const MAIN_ITEMS: NavItem[] = [{ key: "nav.home", to: "/", icon: HomeIcon }];

// On mobile the sidebar is a Sheet overlay; selecting an item should both
// navigate and dismiss it. Returns a click handler that closes the drawer
// (a no-op on desktop, where the sidebar is a persistent rail).
function useDismissOnMobile() {
	const { setOpenMobile } = useSidebar();
	return () => setOpenMobile(false);
}

function NavItems({ items }: { items: NavItem[] }) {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const dismissOnMobile = useDismissOnMobile();
	// Home links to the redirect hub (`/`), which forwards to the active
	// workspace dashboard; highlight it there too, not only on the bare path.
	const dashboardPath = current ? `/w/${current.slug}` : null;

	return (
		<SidebarMenu>
			{items.map((item) => {
				const isActive = pathname === item.to || pathname === dashboardPath;
				return (
					<SidebarMenuItem key={item.key}>
						<SidebarMenuButton
							asChild
							isActive={isActive}
							tooltip={t(item.key)}
							onClick={dismissOnMobile}
							className={cn("h-9", !isActive && "text-sidebar-foreground/70")}
						>
							<Link to={item.to}>
								<item.icon />
								<span>{t(item.key)}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				);
			})}
		</SidebarMenu>
	);
}

function ProjectsGroup() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const projects = useProjects();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const dismissOnMobile = useDismissOnMobile();

	if (!current) return null;
	const active = (projects.data ?? [])
		.filter((project) => project.status === "active")
		.sort((a, b) => a.name.localeCompare(b.name));

	return (
		<Collapsible defaultOpen className="group/collapsible">
			<SidebarGroup>
				<SidebarGroupLabel asChild>
					<CollapsibleTrigger>
						{t("nav.projects")}
						<ChevronRightIcon className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
					</CollapsibleTrigger>
				</SidebarGroupLabel>
				<CollapsibleContent>
					<SidebarGroupContent>
						{projects.isPending ? (
							<SidebarMenu>
								{[0, 1, 2].map((i) => (
									<SidebarMenuItem key={i}>
										<SidebarMenuSkeleton />
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						) : active.length === 0 ? (
							<p className="text-muted-foreground px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
								{t("nav.projectsEmpty")}
							</p>
						) : (
							<SidebarMenu className="gap-0.5">
								{active.map((project) => {
									const isActive =
										pathname === `/w/${current.slug}/projects/${project.slug}`;
									return (
										<SidebarMenuItem key={project.id}>
											<SidebarMenuButton
												asChild
												isActive={isActive}
												tooltip={project.name}
												onClick={dismissOnMobile}
												className={cn(
													"h-9",
													!isActive && "text-sidebar-foreground/70",
												)}
											>
												<Link
													to="/w/$wsSlug/projects/$projectSlug"
													params={{
														wsSlug: current.slug,
														projectSlug: project.slug,
													}}
												>
													<Dot hue={project.hue} size={12} />
													<span>{project.name}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						)}
					</SidebarGroupContent>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	);
}

// Agents that have logged work in the current workspace. Workspace-scoped like
// the rest of the sidebar; the group is hidden entirely until an agent has
// activity here, so it stays out of the way for workspaces that don't use them.
function AgentsGroup() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const dismissOnMobile = useDismissOnMobile();

	// Gate on the instance feature flag so the group disappears immediately when
	// an admin turns agents off, without waiting for activity to drain.
	const agentsEnabled = useQuery({
		queryKey: ["agents-enabled"],
		queryFn: () => api.getAgentsEnabled(),
	});
	const featureOn = agentsEnabled.data?.enabled ?? false;

	const agents = useQuery({
		queryKey: ["workspace-agents", current?.id],
		queryFn: () => api.listWorkspaceAgents(current?.id as string),
		enabled: Boolean(current) && featureOn,
	});

	if (!current || !featureOn) return null;
	const list = agents.data ?? [];
	if (list.length === 0) return null;

	return (
		<Collapsible defaultOpen className="group/collapsible">
			<SidebarGroup>
				<SidebarGroupLabel asChild>
					<CollapsibleTrigger>
						{t("nav.agents")}
						<ChevronRightIcon className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
					</CollapsibleTrigger>
				</SidebarGroupLabel>
				<CollapsibleContent>
					<SidebarGroupContent>
						<SidebarMenu className="gap-0.5">
							{list.map((agent) => {
								const isActive =
									pathname === `/w/${current.slug}/agents/${agent.id}`;
								return (
									<SidebarMenuItem key={agent.id}>
										<SidebarMenuButton
											asChild
											isActive={isActive}
											tooltip={agent.name}
											onClick={dismissOnMobile}
											className={cn(
												"h-9",
												!isActive && "text-sidebar-foreground/70",
											)}
										>
											<Link
												to="/w/$wsSlug/agents/$agentId"
												params={{ wsSlug: current.slug, agentId: agent.id }}
											>
												<AgentTypeIcon type={agent.type} />
												<span>{agent.name}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	);
}

// Settings is the one management surface left in the sidebar: a single cog
// that opens the Settings hub, where a sub-nav reaches every section.
function SettingsMenu() {
	const { t } = useTranslation();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const isActive = pathname.startsWith("/settings");
	const dismissOnMobile = useDismissOnMobile();

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton
					asChild
					isActive={isActive}
					tooltip={t("nav.settings")}
					onClick={dismissOnMobile}
					className={cn("h-9", !isActive && "text-sidebar-foreground/70")}
				>
					<Link to="/settings">
						<SettingsIcon />
						<span>{t("nav.settings")}</span>
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
	const { current } = useWorkspace();
	// An instance admin can pick a workspace they are not a member of (role
	// `null`). They reach it only to manage it via Settings (footer cog stays),
	// so the workspace-scoped navigation is blanked rather than shown.
	const viewingAsNonMember = current != null && current.role == null;
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<WorkspaceSwitcher isAdmin={isAdmin} />
			</SidebarHeader>
			<SidebarContent>
				{!viewingAsNonMember && (
					<>
						<SidebarGroup>
							<NavItems items={MAIN_ITEMS} />
						</SidebarGroup>
						<AgentsGroup />
						<ProjectsGroup />
					</>
				)}
			</SidebarContent>
			<SidebarFooter>
				<SettingsMenu />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
