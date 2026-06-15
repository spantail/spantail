import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	formatPeriodLabel,
	type Report,
	type ReportMeta,
	type ReportTemplate,
} from "@toxil/core";
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
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import { downloadReportMarkdown } from "@/lib/report-download";

/** One report document: a header with its period and the per-document actions. */
export function ReportCard({
	report,
	templates,
	onView,
	onEdit,
	onDuplicate,
}: {
	report: ReportMeta;
	templates: ReportTemplate[];
	onView: (report: Report) => void;
	onEdit: (report: ReportMeta) => void;
	onDuplicate: (report: ReportMeta) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const [sharing, setSharing] = useState(false);

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
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{report.name}{" "}
					<span className="text-muted-foreground font-normal">
						{formatPeriodLabel(report.filters.dateRange)}
					</span>
				</CardTitle>
				<CardDescription>
					{templateName}
					{" · "}
					{new Date(report.updatedAt).toLocaleDateString()}
				</CardDescription>
				<CardAction className="whitespace-nowrap">
					<Button
						variant="ghost"
						size="sm"
						disabled={viewMutation.isPending}
						onClick={() => viewMutation.mutate()}
					>
						{t("reports.view.openAction")}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						disabled={downloadMutation.isPending}
						onClick={() => downloadMutation.mutate()}
					>
						{t("reports.view.downloadAction")}
					</Button>
					<Button variant="ghost" size="sm" onClick={() => setSharing(true)}>
						{t("reports.shares.shareAction")}
					</Button>
					<Button variant="ghost" size="sm" onClick={() => onDuplicate(report)}>
						{t("reports.duplicateAction")}
					</Button>
					<Button variant="ghost" size="sm" onClick={() => onEdit(report)}>
						{t("reports.editAction")}
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="ghost" size="sm">
								{t("reports.deleteAction")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>{t("reports.delete.title")}</AlertDialogTitle>
								<AlertDialogDescription>
									{t("reports.delete.description")}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>
									{t("reports.delete.cancel")}
								</AlertDialogCancel>
								<AlertDialogAction
									className={buttonVariants({ variant: "destructive" })}
									onClick={() => deleteMutation.mutate()}
								>
									{t("reports.delete.confirm")}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</CardAction>
			</CardHeader>
			{error && (
				<CardDescription className="px-6 text-destructive">
					{error}
				</CardDescription>
			)}
			{sharing && (
				<ShareDialog report={report} onClose={() => setSharing(false)} />
			)}
		</Card>
	);
}
