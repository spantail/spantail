import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	deriveNextPeriod,
	formatPeriodLabel,
	type PeriodUnit,
	type Report,
	type ReportMeta,
	type ReportTemplate,
	shiftDays,
	todayInTimezone,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
	// Builtins repeat across workspaces with per-workspace enabled/cadence
	// overrides. New reports anchor to the current workspace, so take builtins
	// from its response (already resolved server-side, and kept fresh because
	// the report-templates query is invalidated on a toggle — unlike me/settings).
	const currentIndex = workspaces.findIndex((w) => w.id === current?.id);
	const currentTemplates =
		currentIndex >= 0 ? (templateQueries[currentIndex]?.data ?? []) : [];
	for (const template of currentTemplates) {
		if (template.builtin && !seen.has(template.id)) {
			seen.add(template.id);
			templates.push(template);
		}
	}
	// Custom templates: union across all the user's workspaces (ids are unique).
	for (const query of templateQueries) {
		for (const template of query.data ?? []) {
			if (template.builtin || seen.has(template.id)) continue;
			seen.add(template.id);
			templates.push(template);
		}
	}
	const templatesReady = templateQueries.every((query) => !query.isPending);
	const templateById = new Map(templates.map((tpl) => [tpl.id, tpl]));

	// Builtin enabled/cadence is per-workspace, so an existing report's
	// read-only state and Duplicate cadence must be resolved against the
	// report's OWN anchor workspace (fresh from its report-templates response),
	// not the current workspace. Custom rows are workspace-independent — fall
	// back to the union when a report's anchor isn't the custom's workspace.
	const stateByWorkspace = new Map<string, Map<string, ReportTemplate>>();
	workspaces.forEach((workspace, i) => {
		const byId = new Map<string, ReportTemplate>();
		for (const tpl of templateQueries[i]?.data ?? []) byId.set(tpl.id, tpl);
		stateByWorkspace.set(workspace.id, byId);
	});
	const reportTemplateState = (
		report: ReportMeta,
	): ReportTemplate | undefined =>
		stateByWorkspace
			.get(report.filters.workspaceIds[0] ?? "")
			?.get(report.templateId) ?? templateById.get(report.templateId);

	const reports = useQuery({
		queryKey: ["reports"],
		queryFn: () => api.listReports(),
	});
	const rows = reports.data ?? [];

	// Project names for the filter dropdown. Reports are owner-scoped to the
	// user's own workspaces, so listing projects per workspace resolves every id.
	const projectQueries = useQueries({
		queries: workspaces.map((workspace) => ({
			queryKey: ["projects", workspace.id],
			queryFn: () => api.listProjects(workspace.id),
		})),
	});
	const projectById = new Map<string, string>();
	for (const query of projectQueries) {
		for (const project of query.data ?? [])
			projectById.set(project.id, project.name);
	}

	// Filters (local state, matching the rest of the app). Period defaults to the
	// last 14 days and keeps any report whose period overlaps it.
	const tz = current?.timezone ?? "UTC";
	const [from, setFrom] = useState(() => shiftDays(todayInTimezone(tz), -13));
	const [to, setTo] = useState(() => todayInTimezone(tz));
	const [projectFilter, setProjectFilter] = useState("all");
	const [tagFilter, setTagFilter] = useState("all");

	// Options derive from all loaded reports so they stay stable across tab and
	// filter changes.
	const projectOptions = [
		...new Set(rows.flatMap((report) => report.filters.projectIds ?? [])),
	]
		.map((id) => ({ id, name: projectById.get(id) ?? id }))
		.sort((a, b) => a.name.localeCompare(b.name));
	const tagOptions = [
		...new Set(rows.flatMap((report) => report.filters.tags ?? [])),
	].sort((a, b) => a.localeCompare(b));

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
		{
			id: "all",
			label: t("reports.tab.all"),
			template: undefined as ReportTemplate | undefined,
			archived: false,
		},
		...enabledTabs.map((tpl) => ({
			id: tpl.id,
			label: tpl.name,
			template: tpl as ReportTemplate | undefined,
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
		// Cadence comes from the report's anchor workspace (builtins vary by ws).
		const unit = reportTemplateState(report)?.periodUnit ?? "custom";
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

	const matches = (report: ReportMeta) => {
		const range = report.filters.dateRange;
		// Period overlap (inclusive). ISO date strings compare lexicographically.
		if (!(range.from <= to && range.to >= from)) return false;
		// Project/tag are inclusive: a report with no project/tag scope covers
		// everything, so it matches any specific selection.
		if (projectFilter !== "all") {
			const ids = report.filters.projectIds;
			if (ids?.length && !ids.includes(projectFilter)) return false;
		}
		if (tagFilter !== "all") {
			const tags = report.filters.tags;
			if (tags?.length && !tags.includes(tagFilter)) return false;
		}
		return true;
	};

	const tabReports = (tabId: string) =>
		rows.filter(
			(report) =>
				(tabId === "all" || report.templateId === tabId) && matches(report),
		);

	const tabBody = (tabItem: (typeof tabs)[number]) => {
		const list = tabReports(tabItem.id);
		if (list.length === 0) {
			const unfilteredCount =
				tabItem.id === "all"
					? rows.length
					: rows.filter((report) => report.templateId === tabItem.id).length;
			// Genuine "no reports yet" on a template tab → offer to create the first.
			if (unfilteredCount === 0 && !tabItem.archived && tabItem.template) {
				return (
					<div className="flex flex-col items-start gap-3">
						<p className="text-muted-foreground text-sm">
							{t("reports.blankState.title", { template: tabItem.label })}
						</p>
						<Button
							onClick={() => openCreate(tabItem.template as ReportTemplate)}
						>
							{t("reports.blankState.createAction", {
								template: tabItem.label,
							})}
						</Button>
					</div>
				);
			}
			// Reports exist but the current filters hide them (or an empty All tab).
			return (
				<p className="text-muted-foreground text-sm">
					{t("reports.filter.empty")}
				</p>
			);
		}
		return (
			<div className="flex flex-col gap-4">
				{list.map((report) => (
					<ReportCard
						key={report.id}
						report={report}
						templates={templates}
						// Read-only when the template is disabled in THIS report's
						// anchor workspace (matches the server's per-report check),
						// independent of the tab's current-workspace create state.
						readOnly={!(reportTemplateState(report)?.enabled ?? false)}
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

			{tabs.length === 1 && templatesReady ? (
				<p className="text-muted-foreground text-sm">
					{t("reports.noTemplates")}
				</p>
			) : (
				<>
					<div className="flex flex-wrap items-end gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="reports-from" className="text-xs">
								{t("reports.from")}
							</Label>
							<Input
								id="reports-from"
								type="date"
								className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
								value={from}
								max={to}
								onChange={(e) => setFrom(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="reports-to" className="text-xs">
								{t("reports.to")}
							</Label>
							<Input
								id="reports-to"
								type="date"
								className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
								value={to}
								min={from}
								onChange={(e) => setTo(e.target.value)}
							/>
						</div>
						{projectOptions.length > 0 && (
							<div className="flex flex-col gap-1.5">
								<Label className="text-xs">{t("reports.filter.project")}</Label>
								<Select value={projectFilter} onValueChange={setProjectFilter}>
									<SelectTrigger className="w-44">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">
											{t("reports.filter.allProjects")}
										</SelectItem>
										{projectOptions.map((project) => (
											<SelectItem key={project.id} value={project.id}>
												{project.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						{tagOptions.length > 0 && (
							<div className="flex flex-col gap-1.5">
								<Label className="text-xs">{t("reports.filter.tag")}</Label>
								<Select value={tagFilter} onValueChange={setTagFilter}>
									<SelectTrigger className="w-44">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">
											{t("reports.filter.allTags")}
										</SelectItem>
										{tagOptions.map((tagOption) => (
											<SelectItem key={tagOption} value={tagOption}>
												{tagOption}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
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
				</>
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
