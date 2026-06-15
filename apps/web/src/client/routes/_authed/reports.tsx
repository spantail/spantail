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
import { PlusIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
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
	Popover,
	PopoverClose,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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

/** Removable chip summarising one active filter, shown beneath the tab bar. */
function FilterChip({
	label,
	removeLabel,
	onClear,
}: {
	label: string;
	removeLabel: string;
	onClear: () => void;
}) {
	return (
		<span className="border-border bg-muted/60 text-foreground inline-flex items-center gap-1 rounded-full border py-1 pr-1 pl-2.5 text-xs font-medium">
			{label}
			<button
				type="button"
				aria-label={removeLabel}
				onClick={onClear}
				className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex size-4 items-center justify-center rounded-full transition-colors"
			>
				<XIcon className="size-3" />
			</button>
		</span>
	);
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
	const projectWorkspaceById = new Map<string, string>();
	for (const query of projectQueries) {
		for (const project of query.data ?? []) {
			projectById.set(project.id, project.name);
			projectWorkspaceById.set(project.id, project.workspaceId);
		}
	}

	// Auxiliary filters (local state). They live in a popover and are off by
	// default: an empty period keeps every report, a project of "all" keeps all.
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [projectFilter, setProjectFilter] = useState("all");

	// Project options come from the workspace project catalog so the filter is
	// always usable, regardless of whether reports declare a project scope.
	const projectOptions = [...projectById.entries()]
		.map(([id, name]) => ({ id, name }))
		.sort((a, b) => a.name.localeCompare(b.name));

	const periodActive = from !== "" || to !== "";
	const projectActive = projectFilter !== "all";
	const activeFilterCount = (periodActive ? 1 : 0) + (projectActive ? 1 : 0);
	const periodLabel =
		from && to
			? formatPeriodLabel({ from, to })
			: from
				? `${t("reports.from")} ${from}`
				: `${t("reports.to")} ${to}`;
	const clearFilters = () => {
		setFrom("");
		setTo("");
		setProjectFilter("all");
	};

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

	// Roving-tabindex keyboard nav for the custom tab strip (ARIA tabs pattern):
	// Left/Right move and activate, Home/End jump to the ends, focus follows.
	const tablistRef = useRef<HTMLDivElement>(null);
	const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const ids = tabs.map((x) => x.id);
		const current = ids.indexOf(activeTab ?? "");
		if (current < 0) return;
		let next = current;
		if (e.key === "ArrowRight") next = (current + 1) % ids.length;
		else if (e.key === "ArrowLeft")
			next = (current - 1 + ids.length) % ids.length;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = ids.length - 1;
		else return;
		e.preventDefault();
		setTab(ids[next] ?? null);
		tablistRef.current
			?.querySelector<HTMLButtonElement>(`[data-tab-id="${ids[next]}"]`)
			?.focus();
	};

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
		// Period overlap (inclusive); an empty bound means "open" on that side.
		// ISO date strings compare lexicographically.
		if (from && range.to < from) return false;
		if (to && range.from > to) return false;
		// The project filter is inclusive: a report with no project scope covers
		// everything within its workspaces, so it matches any selection whose
		// workspace it spans.
		if (projectFilter !== "all") {
			const ids = report.filters.projectIds;
			if (ids?.length) {
				if (!ids.includes(projectFilter)) return false;
			} else {
				// An all-projects report only spans the projects in its own
				// workspaces, so it can't match a project from a workspace it omits.
				const ws = projectWorkspaceById.get(projectFilter);
				if (ws && !report.filters.workspaceIds.includes(ws)) return false;
			}
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
			<div className="divide-y overflow-hidden rounded-xl border">
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
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-heading text-xl font-semibold tracking-tight">
						{t("reports.title")}
					</h1>
					<p className="text-muted-foreground mt-0.5 text-sm">
						{t("reports.description")}
					</p>
				</div>
				<Button
					size="lg"
					disabled={!createTarget}
					onClick={() => createTarget && openCreate(createTarget)}
				>
					<PlusIcon />
					{t("reports.newAction")}
				</Button>
			</div>

			{tabs.length === 1 && templatesReady ? (
				<p className="text-muted-foreground text-sm">
					{t("reports.noTemplates")}
				</p>
			) : (
				<>
					{/* Template tabs scroll horizontally (names are arbitrary), while
					    the filter trigger stays pinned to the right of the strip. The
					    underline sits inside the row (bottom-0) so the scroll area
					    never overflows vertically and shows a stray scrollbar. */}
					<div className="flex flex-col gap-3">
						<div className="flex items-end gap-3 border-b">
							<div className="-mb-px min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								<div
									ref={tablistRef}
									role="tablist"
									aria-orientation="horizontal"
									onKeyDown={onTabKeyDown}
									className="flex w-max items-center gap-1"
								>
									{tabs.map((tabItem) => {
										const selected = activeTab === tabItem.id;
										return (
											<button
												key={tabItem.id}
												type="button"
												role="tab"
												id={`reports-tab-${tabItem.id}`}
												data-tab-id={tabItem.id}
												aria-selected={selected}
												aria-controls="reports-tabpanel"
												tabIndex={selected ? 0 : -1}
												onClick={() => setTab(tabItem.id)}
												className={`relative shrink-0 px-3 pt-1 pb-2.5 text-sm whitespace-nowrap transition-colors ${
													selected
														? "text-foreground font-medium"
														: "text-muted-foreground hover:text-foreground"
												}`}
											>
												{tabItem.label}
												{tabItem.archived ? ` (${t("reports.archived")})` : ""}
												{selected && (
													<span className="bg-foreground absolute inset-x-2 bottom-0 h-0.5 rounded-full" />
												)}
											</button>
										);
									})}
								</div>
							</div>
							<div className="shrink-0 pb-1.5">
								<Popover>
									<PopoverTrigger asChild>
										<Button
											variant={activeFilterCount ? "secondary" : "outline"}
											size="sm"
										>
											<SlidersHorizontalIcon />
											{t("reports.filterAction")}
											{activeFilterCount > 0 && (
												<span className="bg-foreground text-background ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
													{activeFilterCount}
												</span>
											)}
										</Button>
									</PopoverTrigger>
									<PopoverContent align="end" className="w-80">
										<div className="flex flex-col gap-3.5">
											<div className="grid grid-cols-2 gap-3">
												<div className="flex flex-col gap-1.5">
													<Label htmlFor="reports-from" className="text-xs">
														{t("reports.from")}
													</Label>
													<Input
														id="reports-from"
														type="date"
														className="h-9 [color-scheme:light] dark:[color-scheme:dark]"
														value={from}
														max={to || undefined}
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
														className="h-9 [color-scheme:light] dark:[color-scheme:dark]"
														value={to}
														min={from || undefined}
														onChange={(e) => setTo(e.target.value)}
													/>
												</div>
											</div>
											{projectOptions.length > 0 && (
												<div className="flex flex-col gap-1.5">
													<Label className="text-xs">
														{t("reports.filter.project")}
													</Label>
													<Select
														value={projectFilter}
														onValueChange={setProjectFilter}
													>
														<SelectTrigger className="h-9 w-full">
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
										</div>
										<div className="mt-4 flex items-center justify-between">
											<Button
												variant="ghost"
												size="sm"
												className="text-muted-foreground h-8 px-2"
												disabled={!activeFilterCount}
												onClick={clearFilters}
											>
												{t("reports.filter.clear")}
											</Button>
											<PopoverClose asChild>
												<Button size="sm">{t("reports.filter.done")}</Button>
											</PopoverClose>
										</div>
									</PopoverContent>
								</Popover>
							</div>
						</div>
						{activeFilterCount > 0 && (
							<div className="flex flex-wrap items-center gap-2">
								{periodActive && (
									<FilterChip
										label={periodLabel}
										removeLabel={t("reports.filter.remove")}
										onClear={() => {
											setFrom("");
											setTo("");
										}}
									/>
								)}
								{projectActive && (
									<FilterChip
										label={projectById.get(projectFilter) ?? projectFilter}
										removeLabel={t("reports.filter.remove")}
										onClear={() => setProjectFilter("all")}
									/>
								)}
								{activeFilterCount > 1 && (
									<button
										type="button"
										onClick={clearFilters}
										className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
									>
										{t("reports.filter.clear")}
									</button>
								)}
							</div>
						)}
					</div>
					<div
						id="reports-tabpanel"
						role="tabpanel"
						aria-labelledby={activeTab ? `reports-tab-${activeTab}` : undefined}
					>
						{(() => {
							const active = tabs.find((x) => x.id === activeTab);
							return active ? tabBody(active) : null;
						})()}
					</div>
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
