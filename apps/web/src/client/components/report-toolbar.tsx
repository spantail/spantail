import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Report, ReportMeta } from "@toxil/core";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	CopyPlusIcon,
	DownloadIcon,
	MoreHorizontalIcon,
	PencilIcon,
	SendIcon,
	Share2Icon,
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
}: {
	report: Report;
	tab: string;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { openEdit, openDuplicate } = useReportDialogs();
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

	// Archived (template disabled in the report's anchor workspace): no edit or
	// duplicate, matching the server's per-report check.
	const readOnly = !(reportTemplateState(report)?.enabled ?? false);

	const close = () => navigate({ to: "/reports/$tab", params: { tab } });
	const open = (reportId: string) =>
		navigate({ to: "/reports/$tab/$reportId", params: { tab, reportId } });

	return (
		<div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
			<Button
				variant="ghost"
				size="icon"
				className="size-9"
				aria-label={t("reports.toolbar.close")}
				title={t("reports.toolbar.close")}
				onClick={close}
			>
				<XIcon />
			</Button>
			<div className="bg-border mx-1 h-5 w-px" aria-hidden />
			{/* Secondary actions collapse into an overflow menu so the bar stays
			    compact — at mobile widths the explicit buttons would push the
			    prev/next group off-screen. */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-9"
						aria-label={t("reports.moreActions")}
					>
						<MoreHorizontalIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-48">
					<DropdownMenuItem onClick={() => downloadReportMarkdown(report)}>
						<DownloadIcon />
						{t("reports.view.downloadAction")}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setSending(true)}>
						<SendIcon />
						{t("reports.send.sendAction")}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setSharing(true)}>
						<Share2Icon />
						{t("reports.shares.shareAction")}
					</DropdownMenuItem>
					{!readOnly && (
						<DropdownMenuItem onClick={() => openDuplicate(report)}>
							<CopyPlusIcon />
							{t("reports.duplicateAction")}
						</DropdownMenuItem>
					)}
					{!readOnly && (
						<DropdownMenuItem onClick={() => openEdit(report)}>
							<PencilIcon />
							{t("reports.editAction")}
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
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
					className="size-9"
					aria-label={t("reports.toolbar.prev")}
					title={t("reports.toolbar.prev")}
					disabled={!prev}
					onClick={() => prev && open(prev.id)}
				>
					<ChevronLeftIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-9"
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
				onDeleted={close}
			/>
			{sending && (
				<SendReportDialog report={report} onClose={() => setSending(false)} />
			)}
			{sharing && (
				<ShareDialog report={report} onClose={() => setSharing(false)} />
			)}
		</div>
	);
}
