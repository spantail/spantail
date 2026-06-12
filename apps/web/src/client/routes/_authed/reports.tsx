import { useQueries } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { Report, ReportSnapshot, ReportTemplate } from "@toxil/core";
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
	const { workspaces } = useWorkspace();
	const [editing, setEditing] = useState<Report | null>(null);
	const [createdCount, setCreatedCount] = useState(0);
	const [snapshotsFor, setSnapshotsFor] = useState<Report | null>(null);
	const [viewing, setViewing] = useState<{
		report: Report;
		snapshot: ReportSnapshot;
	} | null>(null);

	// Reports are user-owned and can scope any membership workspace, so the
	// template pool is the union across all of them.
	const templateQueries = useQueries({
		queries: workspaces.map((workspace) => ({
			queryKey: ["report-templates", workspace.id],
			queryFn: () => api.listReportTemplates(workspace.id),
		})),
	});
	const seen = new Set<string>();
	const templates: ReportTemplate[] = [];
	for (const query of templateQueries) {
		for (const template of query.data ?? []) {
			// Builtins repeat in every per-workspace response.
			if (seen.has(template.id)) continue;
			seen.add(template.id);
			templates.push(template);
		}
	}
	// A partial union (some queries still pending) must not drive template
	// validation in the form: a custom template would look unavailable.
	const templatesReady = templateQueries.every((query) => !query.isPending);

	if (workspaces.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<h1 className="font-heading text-lg font-semibold">
				{t("reports.title")}
			</h1>
			<p className="text-muted-foreground text-sm">
				{t("reports.description")}
			</p>
			<ReportForm
				// A draft is personal, so it survives workspace switches; the
				// counter resets the form after a successful create.
				key={`${editing?.id ?? "new"}:${createdCount}`}
				templates={templates}
				templatesReady={templatesReady}
				editing={editing}
				onDone={() => {
					if (!editing) setCreatedCount((count) => count + 1);
					setEditing(null);
				}}
				onCancel={() => setEditing(null)}
			/>
			<ReportList
				templates={templates}
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
