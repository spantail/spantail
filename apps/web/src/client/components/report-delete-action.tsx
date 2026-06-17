import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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

/**
 * Confirm + delete a report (owner-only). Trigger-less so callers supply their
 * own button or overflow-menu item. On success it drops the cached detail too:
 * otherwise navigating back to the deleted report within staleTime renders it
 * (and its actions) from cache instead of refetching the 404.
 */
export function DeleteReportConfirm({
	open,
	onOpenChange,
	reportId,
	onDeleted,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	reportId: string;
	onDeleted: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	const deleteMutation = useMutation({
		mutationFn: () => api.deleteReport(reportId),
		onSuccess: async () => {
			queryClient.removeQueries({ queryKey: ["report", reportId] });
			await queryClient.invalidateQueries({ queryKey: ["reports"] });
			onDeleted();
		},
	});

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
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
	);
}

/**
 * Standalone delete button + confirm, for surfaces without an overflow menu
 * (the "report unavailable" state, where a report whose workspace the owner
 * left is still listed and owner-deletable but no longer openable).
 */
export function ReportDeleteAction({
	reportId,
	onDeleted,
}: {
	reportId: string;
	onDeleted: () => void;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className="text-muted-foreground hover:text-destructive size-9"
				aria-label={t("reports.deleteAction")}
				title={t("reports.deleteAction")}
				onClick={() => setOpen(true)}
			>
				<Trash2Icon />
			</Button>
			<DeleteReportConfirm
				open={open}
				onOpenChange={setOpen}
				reportId={reportId}
				onDeleted={onDeleted}
			/>
		</>
	);
}
