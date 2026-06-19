import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeftIcon, LayersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Dot } from "@/components/dot";
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
	useSidebar,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { templateHue } from "@/lib/hue";
import { useReportTemplates } from "@/lib/use-report-templates";
import { useWorkspace } from "@/lib/workspace";

export function ReportsSidebar() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const { setOpenMobile } = useSidebar();
	const { enabledTemplates, templateById } = useReportTemplates();
	const active = useParams({ strict: false, select: (p) => p.tab }) as
		| string
		| undefined;

	// Just the template ids in use — not the full report list — so the sidebar
	// stays cheap when a user owns many reports.
	const templateIds = useQuery({
		queryKey: ["report-template-ids"],
		queryFn: () => api.listReportTemplateIdsInUse(),
	});

	// Disabled templates that still own reports become archived menu items so no
	// document is orphaned (mirrors the old tab strip).
	const enabledIds = new Set(enabledTemplates.map((tpl) => tpl.id));
	const archivedIds = [
		...new Set((templateIds.data ?? []).filter((id) => !enabledIds.has(id))),
	];

	const dismiss = () => setOpenMobile(false);

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							size="lg"
							tooltip={t("reports.backToWorkspace", {
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
										{t("reports.back")}
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
					<SidebarGroupLabel className="text-[11px] tracking-wider uppercase">
						{t("reports.rail.library")}
					</SidebarGroupLabel>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								asChild
								isActive={active === "all"}
								tooltip={t("reports.tab.all")}
								className="h-9"
								onClick={dismiss}
							>
								<Link to="/reports/$tab" params={{ tab: "all" }}>
									<LayersIcon />
									<span>{t("reports.tab.all")}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupLabel className="text-[11px] tracking-wider uppercase">
						{t("reports.rail.templates")}
					</SidebarGroupLabel>
					<SidebarMenu className="gap-1.5">
						{enabledTemplates.map((tpl) => (
							<SidebarMenuItem key={tpl.id}>
								<SidebarMenuButton
									asChild
									isActive={active === tpl.id}
									tooltip={tpl.name}
									className="h-9"
									onClick={dismiss}
								>
									<Link to="/reports/$tab" params={{ tab: tpl.id }}>
										<Dot hue={templateHue(tpl.id)} />
										<span>{tpl.name}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
						{archivedIds.map((id) => (
							<SidebarMenuItem key={id}>
								<SidebarMenuButton
									asChild
									isActive={active === id}
									tooltip={`${templateById.get(id)?.name ?? id} (${t("reports.archived")})`}
									className="h-9"
									onClick={dismiss}
								>
									<Link to="/reports/$tab" params={{ tab: id }}>
										<Dot hue={templateHue(id)} className="opacity-50" />
										<span className="text-muted-foreground">
											{templateById.get(id)?.name ?? id}
										</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
