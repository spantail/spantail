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
 * Delete a report (owner-only) with a confirm dialog. Shared by the detail
 * toolbar and the "report unavailable" state, so a report whose workspace the
 * owner left — still listed and still deletable, but no longer openable — can
 * always be removed without opening it.
 */
export function ReportDeleteAction({
	reportId,
	onDeleted,
}: {
	reportId: string;
	onDeleted: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);

	const deleteMutation = useMutation({
		mutationFn: () => api.deleteReport(reportId),
		onSuccess: async () => {
			// Drop the cached detail too: otherwise navigating back to the deleted
			// report within staleTime renders it (and its actions) from cache
			// instead of refetching the 404.
			queryClient.removeQueries({ queryKey: ["report", reportId] });
			await queryClient.invalidateQueries({ queryKey: ["reports"] });
			onDeleted();
		},
	});

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
			<AlertDialog open={open} onOpenChange={setOpen}>
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
		</>
	);
}
