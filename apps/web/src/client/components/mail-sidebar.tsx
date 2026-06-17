import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type { MailFolder, MailFolderCounts } from "@toxil/core";
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
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

const FOLDERS: { folder: MailFolder; icon: typeof InboxIcon }[] = [
	{ folder: "inbox", icon: InboxIcon },
	{ folder: "starred", icon: StarIcon },
	{ folder: "sent", icon: SendIcon },
	{ folder: "archive", icon: ArchiveIcon },
	{ folder: "trash", icon: Trash2Icon },
];

/** Inbox shows its unread count; the other folders show their total size. */
function folderBadge(
	folder: MailFolder,
	counts: MailFolderCounts | undefined,
): number {
	if (!counts) return 0;
	return folder === "inbox" ? counts.unread : counts[folder];
}

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
							tooltip={t("mail.backToWorkspace", {
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
										{t("mail.back")}
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
					<SidebarMenu>
						{FOLDERS.map(({ folder, icon: Icon }) => {
							const badge = folderBadge(folder, counts.data);
							return (
								<SidebarMenuItem key={folder}>
									<SidebarMenuButton
										asChild
										isActive={active === folder}
										tooltip={t(`mail.folder.${folder}`)}
										onClick={dismiss}
									>
										<Link to="/mail/$folder" params={{ folder }}>
											<Icon />
											<span>{t(`mail.folder.${folder}`)}</span>
										</Link>
									</SidebarMenuButton>
									{badge > 0 && (
										<SidebarMenuBadge
											className={cn(
												"rounded-full font-semibold",
												folder === "inbox"
													? "bg-primary text-primary-foreground peer-data-active/menu-button:text-primary-foreground peer-hover/menu-button:text-primary-foreground"
													: "bg-muted text-muted-foreground",
											)}
										>
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
