import type { Report, ReportMeta } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	ChevronRightIcon,
	DownloadIcon,
	EyeIcon,
	EyeOffIcon,
	MoreVerticalIcon,
	PencilIcon,
	PrinterIcon,
	SendIcon,
	ShareIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { DeleteReportConfirm } from "@/components/report-delete-action";
import { useReportDialogs } from "@/components/report-dialogs";
import { SendReportDialog } from "@/components/send-report-dialog";
import { ShareDialog } from "@/components/share-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { downloadReportMarkdown } from "@/lib/report-download";
import { useReportTemplates } from "@/lib/use-report-templates";

export function ReportToolbar({
	report,
	tab,
	showHeader,
	onToggleHeader,
}: {
	report: Report;
	tab: string;
	showHeader: boolean;
	onToggleHeader: () => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { openEdit } = useReportDialogs();
	const { reportTemplateState } = useReportTemplates();
	const [sharing, setSharing] = useState(false);
	const [sending, setSending] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// Same ordering as the list (tab filter only); aux list filters aren't shared
	// across the route boundary, so prev/next walk the tab's full set.
	const reports = useQuery({
		queryKey: ["reports"],
		queryFn: () => api.listReports(),
	});
	const items: ReportMeta[] = (reports.data ?? []).filter(
		(r) => tab === "all" || r.templateId === tab,
	);
	const index = items.findIndex((r) => r.id === report.id);
	const prev = index > 0 ? items[index - 1] : undefined;
	const next =
		index >= 0 && index < items.length - 1 ? items[index + 1] : undefined;

	// Archived (template disabled in the report's anchor workspace): no Duplicate,
	// which would create a new report from the disabled template. Editing stays
	// available — it revises the frozen document directly and never re-renders.
	const readOnly = !(reportTemplateState(report)?.enabled ?? false);

	const close = () => navigate({ to: "/reports/$tab", params: { tab } });
	const open = (reportId: string) =>
		navigate({ to: "/reports/$tab/$reportId", params: { tab, reportId } });

	return (
		<div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
			<Button
				variant="ghost"
				size="icon"
				className="text-muted-foreground size-9"
				aria-label={t("reports.toolbar.close")}
				title={t("reports.toolbar.close")}
				onClick={close}
			>
				<XIcon />
			</Button>
			<div className="bg-border mx-1 h-5 w-px" aria-hidden />
			{/* Frequently used actions sit directly in the bar on desktop; on the
			    mobile full-width detail view they fold into the overflow menu so the
			    prev/next controls always stay on-screen. */}
			<Button
				variant="ghost"
				size="icon"
				className="text-muted-foreground hidden size-9 md:inline-flex"
				aria-label={t("reports.send.sendAction")}
				title={t("reports.send.sendAction")}
				onClick={() => setSending(true)}
			>
				<SendIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="text-muted-foreground hidden size-9 md:inline-flex"
				aria-label={t("reports.shares.shareAction")}
				title={t("reports.shares.shareAction")}
				onClick={() => setSharing(true)}
			>
				<ShareIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="text-muted-foreground hidden size-9 md:inline-flex"
				aria-label={t("reports.printAction")}
				title={t("reports.printAction")}
				onClick={() => window.print()}
			>
				<PrinterIcon />
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="text-muted-foreground size-9"
						aria-label={t("reports.moreActions")}
					>
						<MoreVerticalIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-48">
					{/* Mobile only: the actions promoted to the bar on desktop. */}
					<DropdownMenuItem
						className="gap-2.5 px-2 py-1.5 md:hidden"
						onSelect={() => setSending(true)}
					>
						<SendIcon />
						{t("reports.send.sendAction")}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="gap-2.5 px-2 py-1.5 md:hidden"
						onSelect={() => setSharing(true)}
					>
						<ShareIcon />
						{t("reports.shares.shareAction")}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="gap-2.5 px-2 py-1.5 md:hidden"
						onSelect={() => window.print()}
					>
						<PrinterIcon />
						{t("reports.printAction")}
					</DropdownMenuItem>
					<DropdownMenuSeparator className="md:hidden" />
					{/* Editing re-renders through the template, so a disabled (archived)
					    template makes the report read-only. */}
					{!readOnly && (
						<DropdownMenuItem
							className="gap-2.5 px-2 py-1.5"
							onClick={() => openEdit(report)}
						>
							<PencilIcon />
							{t("reports.editAction")}
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						className="gap-2.5 px-2 py-1.5"
						onSelect={() => downloadReportMarkdown(report)}
					>
						<DownloadIcon />
						{t("reports.view.downloadAction")}
					</DropdownMenuItem>
					{/* Toggle the version's provenance header above the body. The eye
					    state icon reads as shown / hidden in both positions. */}
					<DropdownMenuItem
						className="gap-2.5 px-2 py-1.5"
						onSelect={onToggleHeader}
					>
						{showHeader ? <EyeIcon /> : <EyeOffIcon />}
						{showHeader
							? t("reports.toolbar.hideHeader")
							: t("reports.toolbar.showHeader")}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						className="gap-2.5 px-2 py-1.5"
						onSelect={() => setDeleting(true)}
					>
						<Trash2Icon />
						{t("reports.deleteAction")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<div className="ml-auto flex items-center gap-1">
				{index >= 0 && items.length > 0 && (
					<span className="text-muted-foreground mr-1 text-xs tabular-nums">
						{t("reports.toolbar.position", {
							index: index + 1,
							total: items.length,
						})}
					</span>
				)}
				<Button
					variant="ghost"
					size="icon"
					className="text-muted-foreground size-9"
					aria-label={t("reports.toolbar.prev")}
					title={t("reports.toolbar.prev")}
					disabled={!prev}
					onClick={() => prev && open(prev.id)}
				>
					<ArrowLeftIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="text-muted-foreground size-9"
					aria-label={t("reports.toolbar.next")}
					title={t("reports.toolbar.next")}
					disabled={!next}
					onClick={() => next && open(next.id)}
				>
					<ChevronRightIcon />
				</Button>
			</div>

			<DeleteReportConfirm
				open={deleting}
				onOpenChange={setDeleting}
				reportId={report.id}
				reportName={report.name}
				onDeleted={close}
			/>
			{sending && (
				<SendReportDialog report={report} onClose={() => setSending(false)} />
			)}
			{sharing && (
				<ShareDialog
					source={{ kind: "report", report }}
					onClose={() => setSharing(false)}
				/>
			)}
		</div>
	);
}
