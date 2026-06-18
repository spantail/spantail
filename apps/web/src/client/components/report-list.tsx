import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	formatDuration,
	formatPeriodLabel,
	type ReportMeta,
} from "@toxil/core";
import { FileTextIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Dot } from "@/components/dot";
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
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { api } from "@/lib/api";
import { hueFromString, templateHue } from "@/lib/hue";
import { useReportTemplates } from "@/lib/use-report-templates";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

const PAGE_SIZE = 50;

/** One report row: navigation only — actions live in the detail toolbar.
 *  A leading dot keys the report to its template; a smaller dot tags its single
 *  project (when scoped to exactly one). */
function ReportListItem({
	report,
	tab,
	templateName,
	projectChip,
	selected,
	index,
}: {
	report: ReportMeta;
	tab: string;
	templateName: string;
	projectChip: { name: string; hue: number } | null;
	selected: boolean;
	index: number;
}) {
	const { i18n } = useTranslation();
	return (
		<Link
			data-nav-index={index}
			to="/reports/$tab/$reportId"
			params={{ tab, reportId: report.id }}
			className={cn(
				"relative flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors",
				selected ? "bg-secondary" : "hover:bg-muted/50",
			)}
		>
			{selected && (
				<span
					aria-hidden
					className="bg-primary absolute inset-y-1 left-0 w-[3px] rounded-r-full"
				/>
			)}
			<Dot hue={templateHue(report.templateId)} className="mt-[7px]" />
			<span className="min-w-0 flex-1">
				{/* line 1 — report name */}
				<span className="text-foreground/90 block truncate text-sm font-medium">
					{report.name}
				</span>
				{/* line 2 — template · single project */}
				<span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
					<span className="truncate">{templateName}</span>
					{projectChip && <span className="opacity-40">·</span>}
					{projectChip && (
						<span className="inline-flex shrink-0 items-center gap-1">
							<Dot hue={projectChip.hue} size={6} />
							{projectChip.name}
						</span>
					)}
				</span>
			</span>
			{/* generated date over total */}
			<span className="flex shrink-0 flex-col items-end gap-0.5 pt-px text-xs tabular-nums">
				<span className="text-muted-foreground whitespace-nowrap">
					{new Date(report.createdAt).toLocaleDateString(i18n.language, {
						month: "short",
						day: "numeric",
					})}
				</span>
				{report.totalMinutes != null && (
					<span className="text-foreground/70 font-medium whitespace-nowrap">
						{formatDuration(report.totalMinutes)}
					</span>
				)}
			</span>
		</Link>
	);
}

export function ReportList({
	tab,
	selectedId,
}: {
	tab: string;
	selectedId?: string;
}) {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { workspaces } = useWorkspace();
	const { openCreate } = useReportDialogs();
	const { templateById, enabledTemplates, templatesReady } =
		useReportTemplates();

	// Auxiliary filters (local). Off by default: empty period keeps everything,
	// project "all" keeps all. Filters are applied server-side so each fetched
	// page is populated even when the result set is skewed.
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [projectFilter, setProjectFilter] = useState("all");

	const reports = useInfiniteQuery({
		queryKey: ["reports", "list", tab, from, to, projectFilter],
		queryFn: ({ pageParam }) =>
			api.listReports({
				templateId: tab === "all" ? undefined : tab,
				from: from || undefined,
				to: to || undefined,
				projectId: projectFilter === "all" ? undefined : projectFilter,
				limit: PAGE_SIZE,
				offset: pageParam,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
	});
	// Flatten once per fetched page set, with an id→index map so keyboard nav's
	// per-keystroke active-index lookup stays O(1) even on large tabs.
	const list = useMemo(() => reports.data?.pages.flat() ?? [], [reports.data]);
	const indexById = useMemo(
		() => new Map(list.map((report, i) => [report.id, i])),
		[list],
	);
	// Reports arrive newest-first, so grouping by creation month yields months in
	// descending order. Each row keeps its flat index for keyboard nav.
	const monthGroups = useMemo(() => {
		const groups: {
			key: string;
			label: string;
			rows: { report: ReportMeta; index: number }[];
		}[] = [];
		list.forEach((report, index) => {
			const key = report.createdAt.slice(0, 7); // YYYY-MM
			let group = groups.find((g) => g.key === key);
			if (!group) {
				const label = new Date(`${key}-01T00:00:00`).toLocaleDateString(
					i18n.language,
					{ month: "long", year: "numeric" },
				);
				group = { key, label, rows: [] };
				groups.push(group);
			}
			group.rows.push({ report, index });
		});
		return groups;
	}, [list, i18n.language]);

	// j/k move the selection straight to the report's route, so the right pane
	// updates as you go. Selection is derived from the URL (selectedId).
	const containerRef = useRef<HTMLDivElement>(null);
	const activeIndex = selectedId ? (indexById.get(selectedId) ?? -1) : -1;
	useListKeyboardNav({
		length: list.length,
		index: activeIndex,
		onMove: (next) => {
			const target = list[next];
			if (target)
				// replace: selection-only moves shouldn't stack history entries
				// (holding j/k would otherwise flood Back/Forward).
				navigate({
					to: "/reports/$tab/$reportId",
					params: { tab, reportId: target.id },
					replace: true,
				});
		},
		onReachEnd: () => {
			if (reports.hasNextPage && !reports.isFetchingNextPage)
				reports.fetchNextPage();
		},
		containerRef,
	});

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
	for (const query of projectQueries) {
		for (const project of query.data ?? []) {
			projectById.set(project.id, project.name);
		}
	}
	const projectOptions = [...projectById.entries()]
		.map(([id, name]) => ({ id, name }))
		.sort((a, b) => a.name.localeCompare(b.name));

	// A row shows a project chip only when the report is scoped to a single,
	// resolvable project — multi-project / all-project reports stay unlabelled.
	const projectChipFor = (
		report: ReportMeta,
	): { name: string; hue: number } | null => {
		const ids = report.filters.projectIds;
		const id = ids?.length === 1 ? ids[0] : undefined;
		if (!id) return null;
		const name = projectById.get(id);
		return name ? { name, hue: hueFromString(id) } : null;
	};

	const periodActive = from !== "" || to !== "";
	const projectActive = projectFilter !== "all";
	const filtersActive = periodActive || projectActive;
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
		// Filtering is server-side, so an empty list with filters off means the
		// tab genuinely has no reports → offer to create on an enabled template tab.
		if (!filtersActive && !archived && tabTemplate) {
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
		if (tab === "all" && !filtersActive && enabledTemplates.length === 0) {
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

			<div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
				{reports.isPending || !templatesReady ? (
					<div className="flex flex-col">
						{[0, 1, 2, 3].map((i) => (
							<div key={i} className="flex items-center gap-3 px-4 py-3">
								<Skeleton className="size-2 shrink-0 rounded-full" />
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
					<>
						{monthGroups.map((group) => (
							<div key={group.key}>
								<div className="text-muted-foreground/70 bg-background/85 sticky top-0 z-[1] border-b px-4 py-1.5 text-[11px] font-medium tracking-wider uppercase backdrop-blur">
									{group.label}
								</div>
								{group.rows.map(({ report, index }) => (
									<ReportListItem
										key={report.id}
										report={report}
										tab={tab}
										templateName={
											templateById.get(report.templateId)?.name ??
											report.templateId
										}
										projectChip={projectChipFor(report)}
										selected={report.id === selectedId}
										index={index}
									/>
								))}
							</div>
						))}
						<InfiniteSentinel
							hasNextPage={Boolean(reports.hasNextPage)}
							isFetchingNextPage={reports.isFetchingNextPage}
							fetchNextPage={() => reports.fetchNextPage()}
						/>
					</>
				)}
			</div>
		</div>
	);
}
