import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	formatPeriodLabel,
	type Report,
	type ReportMeta,
	type ReportTemplate,
} from "@toxil/core";
import {
	DownloadIcon,
	EyeIcon,
	FileTextIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	Share2Icon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { downloadReportMarkdown } from "@/lib/report-download";

/**
 * One report document, rendered as a single row inside a divided list. Routine
 * actions live in a hover overflow menu; the row itself opens the report.
 */
export function ReportCard({
	report,
	templates,
	readOnly = false,
	onView,
	onEdit,
	onDuplicate,
}: {
	report: ReportMeta;
	templates: ReportTemplate[];
	/** Archived (disabled-template) reports: no create/edit, only view/share. */
	readOnly?: boolean;
	onView: (report: Report) => void;
	onEdit: (report: ReportMeta) => void;
	onDuplicate: (report: ReportMeta) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const [sharing, setSharing] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const templateName =
		templates.find((tpl) => tpl.id === report.templateId)?.name ??
		report.templateId;

	const deleteMutation = useMutation({
		mutationFn: () => api.deleteReport(report.id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["reports"] });
		},
		onError: (err: Error) => setError(err.message),
	});

	// The body is fetched on demand: the list payload is metadata only.
	const viewMutation = useMutation({
		mutationFn: () => api.getReport(report.id),
		onSuccess: (full) => {
			setError(null);
			onView(full);
		},
		onError: (err: Error) => setError(err.message),
	});

	const downloadMutation = useMutation({
		mutationFn: () => api.getReport(report.id),
		onSuccess: (full) => downloadReportMarkdown(full),
		onError: (err: Error) => setError(err.message),
	});

	return (
		<div>
			{/* The row body is a button (keyboard-accessible "view"); the overflow
			    menu is a sibling so buttons are never nested. */}
			<div className="group hover:bg-muted/40 flex items-center transition-colors">
				<button
					type="button"
					disabled={viewMutation.isPending}
					onClick={() => viewMutation.mutate()}
					className="flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-4 text-left"
				>
					<span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
						<FileTextIcon className="size-4" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="flex items-baseline gap-2">
							<span className="truncate text-sm font-medium">
								{report.name}
							</span>
							<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
								{formatPeriodLabel(report.filters.dateRange)}
							</span>
						</span>
						<span className="text-muted-foreground mt-0.5 block truncate text-xs">
							{templateName}
							{" · "}
							{new Date(report.updatedAt).toLocaleDateString()}
						</span>
					</span>
				</button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label={t("reports.moreActions")}
							className="text-muted-foreground mr-2 ml-1 size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
						>
							<MoreHorizontalIcon />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							disabled={viewMutation.isPending}
							onClick={() => viewMutation.mutate()}
						>
							<EyeIcon />
							{t("reports.view.openAction")}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={downloadMutation.isPending}
							onClick={() => downloadMutation.mutate()}
						>
							<DownloadIcon />
							{t("reports.view.downloadAction")}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setSharing(true)}>
							<Share2Icon />
							{t("reports.shares.shareAction")}
						</DropdownMenuItem>
						{!readOnly && (
							<DropdownMenuItem onClick={() => onDuplicate(report)}>
								<PlusIcon />
								{t("reports.duplicateAction")}
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						{!readOnly && (
							<DropdownMenuItem onClick={() => onEdit(report)}>
								<PencilIcon />
								{t("reports.editAction")}
							</DropdownMenuItem>
						)}
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setDeleting(true)}
						>
							<Trash2Icon />
							{t("reports.deleteAction")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{error && <p className="text-destructive px-4 pb-3 text-xs">{error}</p>}

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

			{sharing && (
				<ShareDialog report={report} onClose={() => setSharing(false)} />
			)}
		</div>
	);
}
