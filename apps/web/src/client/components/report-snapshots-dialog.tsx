import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Report, ReportSnapshot, ReportSnapshotMeta } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShareDialog } from "@/components/share-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";

export function downloadMarkdown(report: Report, snapshot: ReportSnapshot) {
	const blob = new Blob([snapshot.renderedMarkdown], {
		type: "text/markdown",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${report.name}-${snapshot.generatedAt.slice(0, 10)}.md`;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function ReportSnapshotsDialog({
	report,
	onClose,
	onView,
}: {
	report: Report;
	onClose: () => void;
	onView: (snapshot: ReportSnapshot) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const [sharing, setSharing] = useState<ReportSnapshotMeta | null>(null);

	const snapshots = useQuery({
		queryKey: ["report-snapshots", report.id],
		queryFn: () => api.listReportSnapshots(report.id),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteReportSnapshot(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["report-snapshots", report.id],
			});
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const viewMutation = useMutation({
		mutationFn: (id: string) => api.getReportSnapshot(id),
		onSuccess: (snapshot) => onView(snapshot),
		onError: (err: Error) => setError(err.message),
	});

	const downloadMutation = useMutation({
		mutationFn: (id: string) => api.getReportSnapshot(id),
		onSuccess: (snapshot) => downloadMarkdown(report, snapshot),
		onError: (err: Error) => setError(err.message),
	});

	const rows = snapshots.data ?? [];

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{t("reports.snapshots.title", { name: report.name })}
					</DialogTitle>
				</DialogHeader>
				{error && <p className="text-destructive text-sm">{error}</p>}
				{rows.length === 0 && !snapshots.isPending ? (
					<p className="text-muted-foreground text-sm">
						{t("reports.snapshots.empty")}
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{rows.map((snapshot) => (
							<li
								key={snapshot.id}
								className="flex items-center justify-between gap-2 text-sm"
							>
								<span>
									{new Date(snapshot.generatedAt).toLocaleString()}
									<span className="text-muted-foreground">
										{" "}
										({snapshot.resolvedScope.dateRange.from} –{" "}
										{snapshot.resolvedScope.dateRange.to})
									</span>
								</span>
								<span className="whitespace-nowrap">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => viewMutation.mutate(snapshot.id)}
									>
										{t("reports.snapshots.viewAction")}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => downloadMutation.mutate(snapshot.id)}
									>
										{t("reports.snapshots.downloadAction")}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setSharing(snapshot)}
									>
										{t("reports.shares.shareAction")}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => deleteMutation.mutate(snapshot.id)}
									>
										{t("reports.snapshots.deleteAction")}
									</Button>
								</span>
							</li>
						))}
					</ul>
				)}
			</DialogContent>
			{sharing && (
				<ShareDialog snapshot={sharing} onClose={() => setSharing(null)} />
			)}
		</Dialog>
	);
}
