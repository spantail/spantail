import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	formatPeriodLabel,
	type PeriodUnit,
	periodUnitOf,
	type Report,
	type ReportSnapshot,
	type ReportTemplate,
} from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownView } from "@/components/markdown-view";
import { ReportForm } from "@/components/report-form";
import { ReportSeriesCard } from "@/components/report-series-card";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { downloadSnapshotMarkdown } from "@/lib/report-download";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/reports")({
	component: ReportsPage,
});

const UNIT_ORDER: PeriodUnit[] = ["day", "week", "month", "custom"];

function ReportsPage() {
	const { t } = useTranslation();
	const { workspaces } = useWorkspace();
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Report | null>(null);
	// Remount key so the form re-derives its initial state on every open.
	const [instanceId, setInstanceId] = useState(0);
	const [tab, setTab] = useState<string>("all");
	const [viewing, setViewing] = useState<{
		report: Report;
		snapshot: ReportSnapshot;
	} | null>(null);

	// Reports are user-owned and can filter any membership workspace, so the
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

	const reports = useQuery({
		queryKey: ["reports"],
		queryFn: () => api.listReports(),
	});
	const rows = reports.data ?? [];
	const presentUnits = UNIT_ORDER.filter((unit) =>
		rows.some((report) => periodUnitOf(report.filters.dateRange) === unit),
	);
	// Deleting the last series of a unit removes its tab; fall back to All.
	const activeTab =
		tab === "all" || presentUnits.includes(tab as PeriodUnit) ? tab : "all";

	const openCreate = () => {
		setEditing(null);
		setInstanceId((id) => id + 1);
		setFormOpen(true);
	};
	const openEdit = (report: Report) => {
		setEditing(report);
		setInstanceId((id) => id + 1);
		setFormOpen(true);
	};
	const closeForm = () => {
		setFormOpen(false);
		setEditing(null);
	};

	if (workspaces.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	const seriesList = (unit: PeriodUnit | "all") => (
		<div className="flex flex-col gap-4">
			{rows
				.filter(
					(report) =>
						unit === "all" || periodUnitOf(report.filters.dateRange) === unit,
				)
				.map((report) => (
					<ReportSeriesCard
						key={report.id}
						report={report}
						templates={templates}
						onEdit={openEdit}
						onView={(report, snapshot) => setViewing({ report, snapshot })}
					/>
				))}
		</div>
	);

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<div className="flex items-start justify-between gap-2">
				<div>
					<h1 className="font-heading text-xl font-semibold tracking-tight">
						{t("reports.title")}
					</h1>
					<p className="text-muted-foreground mt-0.5 text-sm">
						{t("reports.description")}
					</p>
				</div>
				<Button onClick={openCreate}>{t("reports.newAction")}</Button>
			</div>

			{rows.length === 0 && !reports.isPending ? (
				<p className="text-muted-foreground text-sm">{t("reports.empty")}</p>
			) : (
				<Tabs value={activeTab} onValueChange={setTab}>
					<TabsList>
						<TabsTrigger value="all">{t("reports.tabs.all")}</TabsTrigger>
						{presentUnits.map((unit) => (
							<TabsTrigger key={unit} value={unit}>
								{t(`reports.tabs.${unit}`)}
							</TabsTrigger>
						))}
					</TabsList>
					<TabsContent value="all">{seriesList("all")}</TabsContent>
					{presentUnits.map((unit) => (
						<TabsContent key={unit} value={unit}>
							{seriesList(unit)}
						</TabsContent>
					))}
				</Tabs>
			)}

			<Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
				<DialogContent size="2xl">
					<DialogHeader>
						<DialogTitle>
							{editing ? t("reports.editTitle") : t("reports.newTitle")}
						</DialogTitle>
						<DialogDescription>
							{t("reports.formDescription")}
						</DialogDescription>
					</DialogHeader>
					<ReportForm
						key={`${editing?.id ?? "new"}:${instanceId}`}
						templates={templates}
						templatesReady={templatesReady}
						editing={editing}
						onComplete={(next) => {
							closeForm();
							if (next) setViewing(next);
						}}
						onCancel={closeForm}
					/>
				</DialogContent>
			</Dialog>

			{viewing && (
				<Dialog open onOpenChange={(open) => !open && setViewing(null)}>
					<DialogContent size="3xl">
						<DialogHeader>
							<DialogTitle className="pr-10">
								{viewing.report.name}{" "}
								{formatPeriodLabel(viewing.snapshot.resolvedFilters.dateRange)}
							</DialogTitle>
							<DialogDescription>
								{t("reports.snapshots.viewerDescription")}
							</DialogDescription>
						</DialogHeader>
						<MarkdownView markdown={viewing.snapshot.renderedMarkdown} />
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() =>
									downloadSnapshotMarkdown(
										viewing.report.name,
										viewing.snapshot,
									)
								}
							>
								{t("reports.snapshots.downloadAction")}
							</Button>
							<DialogClose asChild>
								<Button>{t("reports.snapshots.closeAction")}</Button>
							</DialogClose>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
