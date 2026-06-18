import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	formatDuration,
	formatPeriodLabel,
	type ReportMeta,
} from "@toxil/core";
import { FileTextIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { FilterChip } from "@/components/filter-chip";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useReportDialogs } from "@/components/report-dialogs";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useReportTemplates } from "@/lib/use-report-templates";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

const PAGE_SIZE = 50;

/** One report row: navigation only — actions live in the detail toolbar. */
function ReportListItem({
	report,
	tab,
	templateName,
	selected,
}: {
	report: ReportMeta;
	tab: string;
	templateName: string;
	selected: boolean;
}) {
	const { i18n } = useTranslation();
	return (
		<div
			className={cn(
				"rounded-xl transition-colors",
				selected ? "bg-card ring-border shadow-sm ring-1" : "hover:bg-card/60",
			)}
		>
			<Link
				to="/reports/$tab/$reportId"
				params={{ tab, reportId: report.id }}
				className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left"
			>
				<span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
					<FileTextIcon className="size-4" />
				</span>
				<span className="min-w-0 flex-1">
					{/* line 1 — report name · period */}
					<span className="flex items-baseline gap-2">
						<span className="text-foreground/90 min-w-0 truncate text-sm font-medium">
							{report.name}
						</span>
						<span className="text-muted-foreground ml-auto shrink-0 text-xs whitespace-nowrap tabular-nums">
							{formatPeriodLabel(report.filters.dateRange)}
						</span>
					</span>
					{/* line 2 — template · updated date · total */}
					<span className="mt-0.5 flex items-baseline gap-2">
						<span className="text-muted-foreground min-w-0 truncate text-xs">
							{templateName}
							{" · "}
							{new Date(report.updatedAt).toLocaleDateString(i18n.language, {
								month: "short",
								day: "numeric",
							})}
						</span>
						{report.totalMinutes != null && (
							<span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
								{formatDuration(report.totalMinutes)}
							</span>
						)}
					</span>
				</span>
			</Link>
		</div>
	);
}

export function ReportList({
	tab,
	selectedId,
}: {
	tab: string;
	selectedId?: string;
}) {
	const { t } = useTranslation();
	const { workspaces } = useWorkspace();
	const { openCreate } = useReportDialogs();
	const { templateById, enabledTemplates, templatesReady } =
		useReportTemplates();

	const reports = useQuery({
		queryKey: ["reports"],
		queryFn: () => api.listReports(),
	});
	const rows = reports.data ?? [];

	// Project catalog for the filter dropdown + chip labels. Reports are
	// owner-scoped to the user's workspaces, so listing per workspace resolves
	// every project id.
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
	const projectOptions = [...projectById.entries()]
		.map(([id, name]) => ({ id, name }))
		.sort((a, b) => a.name.localeCompare(b.name));

	// Auxiliary filters (local). Off by default: empty period keeps everything,
	// project "all" keeps all.
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [projectFilter, setProjectFilter] = useState("all");
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

	const matches = (report: ReportMeta) => {
		const range = report.filters.dateRange;
		// Period overlap (inclusive); an empty bound is "open" on that side.
		if (from && range.to < from) return false;
		if (to && range.from > to) return false;
		if (projectFilter !== "all") {
			const ids = report.filters.projectIds;
			if (ids?.length) {
				if (!ids.includes(projectFilter)) return false;
			} else {
				// An all-projects report only spans its own workspaces' projects.
				const ws = projectWorkspaceById.get(projectFilter);
				if (ws && !report.filters.workspaceIds.includes(ws)) return false;
			}
		}
		return true;
	};

	const list = rows.filter(
		(report) => (tab === "all" || report.templateId === tab) && matches(report),
	);

	// Infinite scroll: render a growing window of the filtered list, extended by
	// the sentinel. Reset to the first page whenever the result set changes.
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const filterKey = `${tab}|${from}|${to}|${projectFilter}`;
	const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
	if (filterKey !== prevFilterKey) {
		setPrevFilterKey(filterKey);
		setVisibleCount(PAGE_SIZE);
	}
	// Keep a deep-linked selection within the window so it stays highlighted.
	const selectedIndex = selectedId
		? list.findIndex((report) => report.id === selectedId)
		: -1;
	useEffect(() => {
		if (selectedIndex >= 0)
			setVisibleCount((count) =>
				Math.max(count, Math.ceil((selectedIndex + 1) / PAGE_SIZE) * PAGE_SIZE),
			);
	}, [selectedIndex]);
	const visible = list.slice(0, visibleCount);

	const enabledIds = new Set(enabledTemplates.map((tpl) => tpl.id));
	const tabTemplate = templateById.get(tab);
	const archived = tab !== "all" && !enabledIds.has(tab);
	const title =
		tab === "all" ? t("reports.tab.all") : (tabTemplate?.name ?? tab);
	// New report targets the current tab's template when it's enabled, else the
	// first enabled template (so the button still works on All/archived tabs).
	const createTarget =
		tabTemplate?.enabled === true ? tabTemplate : enabledTemplates[0];

	const emptyBody = () => {
		const unfilteredCount =
			tab === "all"
				? rows.length
				: rows.filter((report) => report.templateId === tab).length;
		// Genuine "no reports yet" on an enabled template tab → offer to create.
		if (unfilteredCount === 0 && !archived && tabTemplate) {
			return (
				<div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
					<div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
						<FileTextIcon className="size-5" />
					</div>
					<p className="text-muted-foreground text-sm">
						{t("reports.blankState.title", { template: title })}
					</p>
					<Button onClick={() => openCreate(tabTemplate)}>
						{t("reports.blankState.createAction", { template: title })}
					</Button>
				</div>
			);
		}
		// No enabled templates at all (fresh workspace).
		if (tab === "all" && rows.length === 0 && enabledTemplates.length === 0) {
			return (
				<p className="text-muted-foreground px-4 py-16 text-center text-sm">
					{t("reports.noTemplates")}
				</p>
			);
		}
		return (
			<p className="text-muted-foreground px-4 py-16 text-center text-sm">
				{t("reports.filter.empty")}
			</p>
		);
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
				<h2 className="font-heading min-w-0 truncate text-base font-semibold tracking-tight">
					{title}
					{archived && (
						<span className="text-muted-foreground ml-1.5 text-xs font-normal">
							({t("reports.archived")})
						</span>
					)}
				</h2>
				<div className="flex shrink-0 items-center gap-1">
					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant={activeFilterCount ? "secondary" : "ghost"}
								size="sm"
								className="h-8"
							>
								<SlidersHorizontalIcon className="size-3.5" />
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
					<Button
						size="sm"
						className="h-8"
						disabled={!createTarget}
						aria-label={t("reports.newAction")}
						title={t("reports.newAction")}
						onClick={() => createTarget && openCreate(createTarget)}
					>
						<PlusIcon className="size-3.5" />
						<span className="hidden sm:inline">{t("reports.newAction")}</span>
					</Button>
				</div>
			</div>

			{activeFilterCount > 0 && (
				<div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
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
				</div>
			)}

			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				{reports.isPending || !templatesReady ? (
					<div className="flex flex-col gap-1">
						{[0, 1, 2, 3].map((i) => (
							<div key={i} className="flex items-center gap-3 px-3 py-3">
								<Skeleton className="size-9 shrink-0 rounded-lg" />
								<div className="flex-1 space-y-2 py-0.5">
									<Skeleton className="h-3 w-2/3" />
									<Skeleton className="h-3 w-1/2" />
								</div>
							</div>
						))}
					</div>
				) : list.length === 0 ? (
					emptyBody()
				) : (
					<div className="flex flex-col gap-1">
						{visible.map((report) => (
							<ReportListItem
								key={report.id}
								report={report}
								tab={tab}
								templateName={
									templateById.get(report.templateId)?.name ?? report.templateId
								}
								selected={report.id === selectedId}
							/>
						))}
						<InfiniteSentinel
							hasNextPage={visibleCount < list.length}
							isFetchingNextPage={false}
							fetchNextPage={() =>
								setVisibleCount((count) => count + PAGE_SIZE)
							}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
