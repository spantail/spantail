import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
	CheckIcon,
	ChevronsUpDownIcon,
	CopyIcon,
	PlusIcon,
} from "lucide-react";
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
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { useCopy } from "@/hooks/use-copy";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

// Copies a workspace id from its row in the switcher. Hidden until the row is
// hovered on desktop (`md:opacity-0` + group-hover) and always shown on mobile,
// where there is no hover. Stops propagation so copying never selects the row.
function CopyWorkspaceId({ id }: { id: string }) {
	const { t } = useTranslation();
	const { copied, copy } = useCopy();
	const label = t("workspace.copyId");

	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={(event) => {
				event.stopPropagation();
				copy(id);
			}}
			className={cn(
				"text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-6 shrink-0 items-center justify-center rounded-md outline-hidden transition focus-visible:ring-2 focus-visible:opacity-100 group-hover/ws-item:opacity-100 md:opacity-0 [&>svg]:size-3.5",
			)}
		>
			{copied ? <CheckIcon /> : <CopyIcon />}
		</button>
	);
}

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
							<WorkspaceAvatar
								name={current?.name ?? ""}
								logoUrl={current?.logoUrl}
								className="size-8 text-xs"
							/>
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
						{/* Archived workspaces are hidden here; they are managed (and
						    unarchived) from the Settings workspaces pane. */}
						{workspaces
							.filter((workspace) => !workspace.archivedAt)
							.map((workspace) => (
								<DropdownMenuItem
									key={workspace.id}
									onClick={() => selectWorkspace(workspace)}
									className="group/ws-item gap-2 p-2"
								>
									<WorkspaceAvatar
										name={workspace.name}
										logoUrl={workspace.logoUrl}
										className="size-6 text-[0.625rem]"
									/>
									<span className="flex-1 truncate">{workspace.name}</span>
									<CopyWorkspaceId id={workspace.id} />
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
