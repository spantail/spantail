import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type AbsoluteDateRange,
	formatPeriodLabel,
	type Report,
	type ReportSnapshot,
	type ReportSnapshotMeta,
	type ReportTemplate,
} from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RunReportDialog } from "@/components/run-report-dialog";
import { ShareDialog } from "@/components/share-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import { downloadSnapshotMarkdown } from "@/lib/report-download";

function rangeLabel(report: Report, t: (key: string) => string): string {
	const range = report.filters.dateRange;
	if (typeof range === "string") return t(`reports.range.${range}`);
	return `${range.from} – ${range.to}`;
}

/** i18n key suffix for the create-next action, specific to the cadence. */
function createNextKey(report: Report): string {
	const range = report.filters.dateRange;
	if (typeof range !== "string") return "custom";
	switch (range) {
		case "today":
		case "yesterday":
			return range;
		case "this_week":
		case "last_week":
			return "week";
		case "this_month":
		case "last_month":
			return "month";
	}
}

/** One report series: the definition header plus its snapshot documents. */
export function ReportSeriesCard({
	report,
	templates,
	onEdit,
	onView,
}: {
	report: Report;
	templates: ReportTemplate[];
	onEdit: (report: Report) => void;
	onView: (report: Report, snapshot: ReportSnapshot) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const [running, setRunning] = useState(false);
	const [sharing, setSharing] = useState<ReportSnapshotMeta | null>(null);

	const snapshots = useQuery({
		queryKey: ["report-snapshots", report.id],
		queryFn: () => api.listReportSnapshots(report.id),
	});
	const rows = snapshots.data ?? [];

	// The series advances from the snapshot covering the latest period — not
	// the latest generatedAt, so a backfill run doesn't rewind the suggestion.
	const previous = rows.reduce<AbsoluteDateRange | null>(
		(latest, snapshot) =>
			!latest || snapshot.resolvedFilters.dateRange.to > latest.to
				? snapshot.resolvedFilters.dateRange
				: latest,
		null,
	);

	const deleteReportMutation = useMutation({
		mutationFn: () => api.deleteReport(report.id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["reports"] });
		},
		onError: (err: Error) => setError(err.message),
	});

	const deleteSnapshotMutation = useMutation({
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
		onSuccess: (snapshot) => {
			setError(null);
			onView(report, snapshot);
		},
		onError: (err: Error) => setError(err.message),
	});

	const downloadMutation = useMutation({
		mutationFn: (id: string) => api.getReportSnapshot(id),
		onSuccess: (snapshot) => downloadSnapshotMarkdown(report.name, snapshot),
		onError: (err: Error) => setError(err.message),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">{report.name}</CardTitle>
				<CardDescription>
					{templates.find((tpl) => tpl.id === report.templateId)?.name ??
						report.templateId}
					{" · "}
					{rangeLabel(report, t)}
				</CardDescription>
				<CardAction className="whitespace-nowrap">
					<Button
						variant="outline"
						size="sm"
						className="mr-1"
						// The dialog captures `previous` on open; opening before the
						// snapshot list resolves would suggest the wrong period.
						disabled={snapshots.isPending}
						onClick={() => setRunning(true)}
					>
						{t(`reports.createNext.${createNextKey(report)}`)}
					</Button>
					<Button variant="ghost" size="sm" onClick={() => onEdit(report)}>
						{t("reports.editAction")}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						disabled={deleteReportMutation.isPending}
						onClick={() => deleteReportMutation.mutate()}
					>
						{t("reports.deleteAction")}
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
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
									{report.name}{" "}
									{formatPeriodLabel(snapshot.resolvedFilters.dateRange)}
									<span className="text-muted-foreground">
										{" · "}
										{new Date(snapshot.generatedAt).toLocaleDateString()}
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
										onClick={() => deleteSnapshotMutation.mutate(snapshot.id)}
									>
										{t("reports.snapshots.deleteAction")}
									</Button>
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
			{running && (
				<RunReportDialog
					report={report}
					previous={previous}
					onClose={() => setRunning(false)}
					onSuccess={(snapshot) => {
						setRunning(false);
						onView(report, snapshot);
					}}
				/>
			)}
			{sharing && (
				<ShareDialog
					snapshot={sharing}
					title={`${report.name} ${formatPeriodLabel(sharing.resolvedFilters.dateRange)}`}
					onClose={() => setSharing(null)}
				/>
			)}
		</Card>
	);
}
