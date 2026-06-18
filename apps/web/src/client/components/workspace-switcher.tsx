import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronsUpDownIcon, ClockIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/lib/workspace";

export function WorkspaceSwitcher({ isAdmin }: { isAdmin: boolean }) {
	const { t } = useTranslation();
	const { isMobile } = useSidebar();
	const { workspaces, current, setCurrentId } = useWorkspace();
	const navigate = useNavigate();
	const onWorkspaceRoute = useRouterState({
		select: (s) => s.location.pathname.startsWith("/w/"),
	});
	const [createOpen, setCreateOpen] = useState(false);

	// Switching always updates the persisted active workspace (which drives the
	// top-level surfaces: settings, reports, log-work). On a workspace-scoped
	// route the URL is the source of truth, so also navigate to the new
	// workspace's dashboard — its projects differ, so the current project path
	// would not resolve.
	function selectWorkspace(workspace: (typeof workspaces)[number]) {
		setCurrentId(workspace.id);
		if (onWorkspaceRoute) {
			navigate({ to: "/w/$wsSlug", params: { wsSlug: workspace.slug } });
		}
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
								<ClockIcon className="size-4" />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">
									{current?.name ?? t("workspace.none")}
								</span>
								<span className="truncate text-xs">{current?.slug ?? ""}</span>
							</div>
							<ChevronsUpDownIcon className="ml-auto" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuLabel className="text-muted-foreground text-xs">
							{t("workspace.label")}
						</DropdownMenuLabel>
						{workspaces.map((workspace) => (
							<DropdownMenuItem
								key={workspace.id}
								onClick={() => selectWorkspace(workspace)}
								className="gap-2 p-2"
							>
								{workspace.name}
							</DropdownMenuItem>
						))}
						{isAdmin && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => setCreateOpen(true)}
									className="gap-2 p-2"
								>
									<PlusIcon className="size-4" />
									{t("workspace.createAction")}
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				<CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
