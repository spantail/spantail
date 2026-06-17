import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Report, ReportMeta } from "@toxil/core";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	CopyPlusIcon,
	DownloadIcon,
	PencilIcon,
	SendIcon,
	Share2Icon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useReportDialogs } from "@/components/report-dialogs";
import { SendReportDialog } from "@/components/send-report-dialog";
import { ShareDialog } from "@/components/share-dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
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
	const queryClient = useQueryClient();
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

	const deleteMutation = useMutation({
		mutationFn: () => api.deleteReport(report.id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["reports"] });
			close();
		},
	});

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
			<Button
				variant="ghost"
				size="icon"
				className="size-9"
				aria-label={t("reports.view.downloadAction")}
				title={t("reports.view.downloadAction")}
				onClick={() => downloadReportMarkdown(report)}
			>
				<DownloadIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="size-9"
				aria-label={t("reports.send.sendAction")}
				title={t("reports.send.sendAction")}
				onClick={() => setSending(true)}
			>
				<SendIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="size-9"
				aria-label={t("reports.shares.shareAction")}
				title={t("reports.shares.shareAction")}
				onClick={() => setSharing(true)}
			>
				<Share2Icon />
			</Button>
			{!readOnly && (
				<>
					<Button
						variant="ghost"
						size="icon"
						className="size-9"
						aria-label={t("reports.duplicateAction")}
						title={t("reports.duplicateAction")}
						onClick={() => openDuplicate(report)}
					>
						<CopyPlusIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-9"
						aria-label={t("reports.editAction")}
						title={t("reports.editAction")}
						onClick={() => openEdit(report)}
					>
						<PencilIcon />
					</Button>
				</>
			)}
			<Button
				variant="ghost"
				size="icon"
				className="text-muted-foreground hover:text-destructive size-9"
				aria-label={t("reports.deleteAction")}
				title={t("reports.deleteAction")}
				onClick={() => setDeleting(true)}
			>
				<Trash2Icon />
			</Button>

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

			<AlertDialog open={deleting} onOpenChange={setDeleting}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("reports.delete.title")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("reports.delete.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("reports.delete.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							onClick={() => deleteMutation.mutate()}
						>
							{t("reports.delete.confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{sending && (
				<SendReportDialog report={report} onClose={() => setSending(false)} />
			)}
			{sharing && (
				<ShareDialog report={report} onClose={() => setSharing(false)} />
			)}
		</div>
	);
}
