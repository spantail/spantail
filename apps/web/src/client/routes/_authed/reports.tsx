import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	deriveNextPeriod,
	formatPeriodLabel,
	type PeriodUnit,
	type Report,
	type ReportMeta,
	type ReportTemplate,
} from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownView } from "@/components/markdown-view";
import { ReportCard } from "@/components/report-card";
import { ReportForm, type ReportFormSeed } from "@/components/report-form";
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
import { downloadReportMarkdown } from "@/lib/report-download";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/reports")({
	component: ReportsPage,
});

const UNIT_RANK: Record<PeriodUnit, number> = {
	day: 0,
	week: 1,
	month: 2,
	custom: 3,
};

const UNIT_PRESET: Record<PeriodUnit, ReportFormSeed["rangeChoice"]> = {
	day: "today",
	week: "this_week",
	month: "this_month",
	custom: "custom",
};

interface FormState {
	editingId: string | null;
	titleKey: string;
	seed: ReportFormSeed;
}

function ReportsPage() {
	const { t } = useTranslation();
	const { workspaces, current } = useWorkspace();
	const [form, setForm] = useState<FormState | null>(null);
	// Remount key so the form re-derives its initial state on every open.
	const [instanceId, setInstanceId] = useState(0);
	const [tab, setTab] = useState<string | null>(null);
	const [viewing, setViewing] = useState<Report | null>(null);

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
			if (seen.has(template.id)) continue;
			seen.add(template.id);
			templates.push(template);
		}
	}
	const templatesReady = templateQueries.every((query) => !query.isPending);
	const templateById = new Map(templates.map((tpl) => [tpl.id, tpl]));

	const reports = useQuery({
		queryKey: ["reports"],
		queryFn: () => api.listReports(),
	});
	const rows = reports.data ?? [];

	// One tab per enabled template, plus archived (disabled) templates that
	// still have reports so no document is ever orphaned.
	const enabledTabs = templates
		.filter((tpl) => tpl.enabled)
		.sort(
			(a, b) =>
				UNIT_RANK[a.periodUnit] - UNIT_RANK[b.periodUnit] ||
				a.name.localeCompare(b.name),
		);
	const enabledIds = new Set(enabledTabs.map((tpl) => tpl.id));
	const archivedIds = [
		...new Set(
			rows.map((r) => r.templateId).filter((id) => !enabledIds.has(id)),
		),
	];
	const tabs = [
		...enabledTabs.map((tpl) => ({
			id: tpl.id,
			label: tpl.name,
			template: tpl,
			archived: false,
		})),
		...archivedIds.map((id) => ({
			id,
			label: templateById.get(id)?.name ?? id,
			template: templateById.get(id),
			archived: true,
		})),
	];
	const activeTab =
		tab && tabs.some((x) => x.id === tab) ? tab : (tabs[0]?.id ?? null);

	const newSeed = (template: ReportTemplate): ReportFormSeed => ({
		name: "",
		nameEdited: false,
		templateId: template.id,
		workspaceIds: template.workspaceId
			? [template.workspaceId]
			: current
				? [current.id]
				: [],
		projectIds: [],
		rangeChoice: UNIT_PRESET[template.periodUnit],
		from: "",
		to: "",
		tags: "",
		note: "",
	});

	const openCreate = (template: ReportTemplate) => {
		setForm({
			editingId: null,
			titleKey: "reports.newTitle",
			seed: newSeed(template),
		});
		setInstanceId((id) => id + 1);
	};

	const openEdit = (report: ReportMeta) => {
		setForm({
			editingId: report.id,
			titleKey: "reports.editTitle",
			seed: {
				name: report.name,
				nameEdited: true,
				templateId: report.templateId,
				workspaceIds: report.filters.workspaceIds,
				projectIds: report.filters.projectIds ?? [],
				rangeChoice: "custom",
				from: report.filters.dateRange.from,
				to: report.filters.dateRange.to,
				tags: (report.filters.tags ?? []).join(", "),
				note: report.note ?? "",
			},
		});
		setInstanceId((id) => id + 1);
	};

	const openDuplicate = (report: ReportMeta) => {
		const unit = templateById.get(report.templateId)?.periodUnit ?? "custom";
		const timezone =
			workspaces.find((w) => w.id === report.filters.workspaceIds[0])
				?.timezone ??
			current?.timezone ??
			"UTC";
		const next = deriveNextPeriod(unit, report.filters.dateRange, timezone);
		setForm({
			editingId: null,
			titleKey: "reports.duplicateTitle",
			seed: {
				name: "",
				nameEdited: false,
				templateId: report.templateId,
				workspaceIds: report.filters.workspaceIds,
				projectIds: report.filters.projectIds ?? [],
				rangeChoice: "custom",
				from: next.from,
				to: next.to,
				tags: (report.filters.tags ?? []).join(", "),
				// Notes differ every period, so a duplicate starts with a blank one.
				note: "",
			},
		});
		setInstanceId((id) => id + 1);
	};

	const closeForm = () => setForm(null);

	if (workspaces.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	const activeTemplate = tabs.find((x) => x.id === activeTab)?.template;
	const createTarget =
		activeTemplate?.enabled === true ? activeTemplate : enabledTabs[0];

	const tabReports = (templateId: string) =>
		rows.filter((report) => report.templateId === templateId);

	const tabBody = (tabItem: (typeof tabs)[number]) => {
		const list = tabReports(tabItem.id);
		if (list.length === 0) {
			return (
				<div className="flex flex-col items-start gap-3">
					<p className="text-muted-foreground text-sm">
						{t("reports.blankState.title", { template: tabItem.label })}
					</p>
					{!tabItem.archived && tabItem.template && (
						<Button
							onClick={() => openCreate(tabItem.template as ReportTemplate)}
						>
							{t("reports.blankState.createAction", {
								template: tabItem.label,
							})}
						</Button>
					)}
				</div>
			);
		}
		return (
			<div className="flex flex-col gap-4">
				{list.map((report) => (
					<ReportCard
						key={report.id}
						report={report}
						templates={templates}
						onView={setViewing}
						onEdit={openEdit}
						onDuplicate={openDuplicate}
					/>
				))}
			</div>
		);
	};

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
				<Button
					disabled={!createTarget}
					onClick={() => createTarget && openCreate(createTarget)}
				>
					{t("reports.newAction")}
				</Button>
			</div>

			{tabs.length === 0 && templatesReady ? (
				<p className="text-muted-foreground text-sm">
					{t("reports.noTemplates")}
				</p>
			) : (
				<Tabs value={activeTab ?? undefined} onValueChange={setTab}>
					<TabsList>
						{tabs.map((tabItem) => (
							<TabsTrigger key={tabItem.id} value={tabItem.id}>
								{tabItem.label}
								{tabItem.archived ? ` (${t("reports.archived")})` : ""}
							</TabsTrigger>
						))}
					</TabsList>
					{tabs.map((tabItem) => (
						<TabsContent key={tabItem.id} value={tabItem.id}>
							{tabBody(tabItem)}
						</TabsContent>
					))}
				</Tabs>
			)}

			{form && (
				<Dialog open onOpenChange={(open) => !open && closeForm()}>
					<DialogContent size="2xl">
						<DialogHeader>
							<DialogTitle>{t(form.titleKey)}</DialogTitle>
							<DialogDescription>
								{t("reports.formDescription")}
							</DialogDescription>
						</DialogHeader>
						<ReportForm
							key={`${form.editingId ?? "new"}:${instanceId}`}
							templates={templates}
							templatesReady={templatesReady}
							editingId={form.editingId}
							seed={form.seed}
							onComplete={(report) => {
								closeForm();
								setViewing(report);
							}}
							onCancel={closeForm}
						/>
					</DialogContent>
				</Dialog>
			)}

			{viewing && (
				<Dialog open onOpenChange={(open) => !open && setViewing(null)}>
					<DialogContent size="3xl">
						<DialogHeader>
							<DialogTitle className="pr-10">
								{viewing.name} {formatPeriodLabel(viewing.filters.dateRange)}
							</DialogTitle>
							<DialogDescription>
								{t("reports.view.description")}
							</DialogDescription>
						</DialogHeader>
						<MarkdownView markdown={viewing.renderedMarkdown} />
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => viewing && downloadReportMarkdown(viewing)}
							>
								{t("reports.view.downloadAction")}
							</Button>
							<DialogClose asChild>
								<Button>{t("reports.view.closeAction")}</Button>
							</DialogClose>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
