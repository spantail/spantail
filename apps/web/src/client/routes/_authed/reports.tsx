import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { Report, ReportSnapshot } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownView } from "@/components/markdown-view";
import { ReportForm } from "@/components/report-form";
import { ReportList } from "@/components/report-list";
import {
	downloadMarkdown,
	ReportSnapshotsDialog,
} from "@/components/report-snapshots-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/reports")({
	component: ReportsPage,
});

function ReportsPage() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const [editing, setEditing] = useState<Report | null>(null);
	const [snapshotsFor, setSnapshotsFor] = useState<Report | null>(null);
	const [viewing, setViewing] = useState<{
		report: Report;
		snapshot: ReportSnapshot;
	} | null>(null);

	const templates = useQuery({
		queryKey: ["report-templates", current?.id],
		queryFn: () => api.listReportTemplates(current?.id ?? ""),
		enabled: Boolean(current),
	});

	if (!current) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<h1 className="font-heading text-lg font-semibold">
				{t("reports.title")}
			</h1>
			<ReportForm
				// Keyed by workspace too: the default scope is read once on
				// mount and must not survive a sidebar workspace switch.
				key={`${current.id}:${editing?.id ?? "new"}`}
				templates={templates.data ?? []}
				editing={editing}
				onDone={() => setEditing(null)}
				onCancel={() => setEditing(null)}
			/>
			<ReportList
				templates={templates.data ?? []}
				onEdit={setEditing}
				onView={(report, snapshot) => setViewing({ report, snapshot })}
				onSnapshots={setSnapshotsFor}
			/>
			{snapshotsFor && (
				<ReportSnapshotsDialog
					report={snapshotsFor}
					onClose={() => setSnapshotsFor(null)}
					onView={(snapshot) => setViewing({ report: snapshotsFor, snapshot })}
				/>
			)}
			{viewing && (
				<Dialog open onOpenChange={(open) => !open && setViewing(null)}>
					<DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
						<DialogHeader>
							<DialogTitle className="flex items-center justify-between gap-2 pr-6">
								{viewing.report.name}
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										downloadMarkdown(viewing.report, viewing.snapshot)
									}
								>
									{t("reports.snapshots.downloadAction")}
								</Button>
							</DialogTitle>
						</DialogHeader>
						<MarkdownView markdown={viewing.snapshot.renderedMarkdown} />
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
