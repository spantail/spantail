import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type { MailFolder } from "@toxil/core";
import {
	ArchiveIcon,
	ArrowLeftIcon,
	InboxIcon,
	SendIcon,
	StarIcon,
	Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

const FOLDERS: { folder: MailFolder; icon: typeof InboxIcon }[] = [
	{ folder: "inbox", icon: InboxIcon },
	{ folder: "starred", icon: StarIcon },
	{ folder: "sent", icon: SendIcon },
	{ folder: "archive", icon: ArchiveIcon },
	{ folder: "trash", icon: Trash2Icon },
];

export function MailSidebar() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const { setOpenMobile } = useSidebar();
	const active = useParams({ strict: false, select: (p) => p.folder }) as
		| MailFolder
		| undefined;
	const counts = useQuery({
		queryKey: ["mail-counts"],
		queryFn: () => api.getMailboxCounts(),
		refetchInterval: 60_000,
	});

	const dismiss = () => setOpenMobile(false);

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							size="lg"
							tooltip={t("messages.backToWorkspace", {
								name: current?.name ?? "",
							})}
							onClick={dismiss}
						>
							<Link to="/">
								<div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
									<ArrowLeftIcon className="size-4" />
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="text-muted-foreground truncate text-xs">
										{t("messages.back")}
									</span>
									<span className="truncate font-medium">
										{current?.name ?? ""}
									</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenu className="gap-1.5">
						{FOLDERS.map(({ folder, icon: Icon }) => {
							// Only the inbox carries a badge — its unread count.
							const badge = folder === "inbox" ? (counts.data?.unread ?? 0) : 0;
							return (
								<SidebarMenuItem key={folder}>
									<SidebarMenuButton
										asChild
										isActive={active === folder}
										tooltip={t(`messages.folder.${folder}`)}
										className="h-9"
										onClick={dismiss}
									>
										<Link to="/messages/$folder" params={{ folder }}>
											<Icon />
											<span>{t(`messages.folder.${folder}`)}</span>
										</Link>
									</SidebarMenuButton>
									{badge > 0 && (
										<SidebarMenuBadge className="bg-primary text-primary-foreground peer-data-active/menu-button:text-primary-foreground peer-hover/menu-button:text-primary-foreground rounded-full font-semibold">
											{badge > 99 ? "99+" : badge}
										</SidebarMenuBadge>
									)}
								</SidebarMenuItem>
							);
						})}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
