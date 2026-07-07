import type { AgentEntry } from "@spantail/core";
import {
	dominantEntryDate,
	formatDuration,
	MAX_LINKED_AGENT_ENTRIES,
	resolveDateRange,
} from "@spantail/core";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { SparklesIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AgentEntryDetailPanel } from "@/components/agent-entry-detail-panel";
import { AgentTypeIcon } from "@/components/agent-icon";
import { AgentStats } from "@/components/agent-stats";
import {
	type DashboardPeriod,
	PeriodSelector,
} from "@/components/dashboard/period-selector";
import { useEntryDialog } from "@/components/entry-dialog";
import type { EntryCreatePrefill } from "@/components/entry-form";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { ProjectMarker } from "@/components/project-marker";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { useProjects } from "@/hooks/use-projects";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/document-title";
import {
	formatClock,
	formatCompactNumber,
	formatEntryDate,
} from "@/lib/format";
import { isTypingTarget } from "@/lib/keyboard";
import { invalidateAgentEntryData } from "@/lib/query";
import { useWorkspace } from "@/lib/workspace";

// Page size for the in-range sessions table, loaded incrementally on scroll.
const PAGE_SIZE = 50;

// The note field caps at 10,000 chars server-side; the joined description
// list is truncated to fit rather than failing the create.
const MAX_NOTE_LENGTH = 10_000;

/**
 * Log-work initial values mechanically derived from the selected sessions.
 * Duration is the plain sum; the date is the local day carrying the most
 * duration (ties → most recent). When exactly one session has a description
 * it becomes the entry description; otherwise the descriptions become a
 * bulleted note and the description is left for the user.
 * Callers guarantee the selection shares a single projectId.
 */
function buildPrefill(
	entries: AgentEntry[],
	timezone: string,
): EntryCreatePrefill {
	const descriptions = entries
		.map((entry) => entry.description?.trim())
		.filter((d): d is string => Boolean(d));
	const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
	return {
		projectId: entries[0]?.projectId ?? undefined,
		// A work entry's duration must be positive; an all-zero selection leaves
		// the field for the user instead of prefilling an unsubmittable "0".
		durationMinutes: totalMinutes > 0 ? totalMinutes : undefined,
		entryDate:
			dominantEntryDate(
				// startedAt is non-null in storage but nullable in the schema type.
				entries
					.filter((e) => e.startedAt != null)
					.map((e) => ({
						startedAt: e.startedAt as string,
						endedAt: e.endedAt,
						durationMinutes: e.durationMinutes,
					})),
				timezone,
			) ?? undefined,
		description: descriptions.length === 1 ? descriptions[0] : undefined,
		note:
			descriptions.length > 1
				? descriptions
						.map((d) => `- ${d}`)
						.join("\n")
						.slice(0, MAX_NOTE_LENGTH)
				: undefined,
		agentEntryIds: entries.map((e) => e.id),
	};
}

export const Route = createFileRoute("/_authed/w/$wsSlug/agents/$agentId")({
	component: AgentPage,
});

function AgentPage() {
	const { t, i18n } = useTranslation();
	const { agentId } = Route.useParams();
	const { current } = useWorkspace();
	const workspaceId = current?.id;
	const timezone = useUserTimezone();

	const [period, setPeriod] = useState<DashboardPeriod>("last_30_days");
	const range = resolveDateRange(period, timezone);

	// The agent's name/type come from the workspace-activity list (same query the
	// sidebar loads); an agent with no activity here simply isn't found.
	const agents = useQuery({
		queryKey: ["workspace-agents", workspaceId],
		queryFn: () => api.listWorkspaceAgents(workspaceId as string),
		enabled: Boolean(workspaceId),
	});
	const agent = (agents.data ?? []).find((a) => a.id === agentId);

	// Once the agent list settles without a match, fall back to the section
	// title so a missing agent never leaves a stale name in the tab.
	useDocumentTitle(
		!current || agents.isPending
			? undefined
			: `${agent ? agent.name : t("nav.agents")} | ${current.name}`,
	);

	const projects = useProjects();
	// One id→project map per render so the sessions table's name/hue lookups stay
	// O(1) per row rather than scanning the project list twice for every session.
	const projectById = new Map((projects.data ?? []).map((p) => [p.id, p]));
	const projectName = (id: string | null) =>
		id ? (projectById.get(id)?.name ?? id) : t("projects.unassigned");

	const entries = useInfiniteQuery({
		// Each entry's `entryDate` is derived server-side in the viewer's timezone,
		// so it belongs in the cache key — otherwise changing the timezone keeps
		// serving rows dated for the old one until the query is remounted.
		queryKey: [
			"agent-entries",
			workspaceId,
			agentId,
			{ from: range.from, to: range.to, timezone },
		],
		queryFn: ({ pageParam }) =>
			api.listAgentEntries({
				workspaceId: workspaceId as string,
				agentId,
				from: range.from,
				to: range.to,
				limit: PAGE_SIZE,
				offset: pageParam,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
		enabled: Boolean(workspaceId),
	});
	// Memoised off the loaded pages so j/k selection re-renders don't re-flatten
	// the whole list on every keypress.
	const list = useMemo(
		() => entries.data?.pages.flat() ?? [],
		[entries.data?.pages],
	);
	const loadMore = () => {
		if (entries.hasNextPage && !entries.isFetchingNextPage)
			entries.fetchNextPage();
	};

	// Vim-style j/k navigation over the loaded session rows; j at the last row
	// pulls the next page so keyboard users aren't stuck at the scroll sentinel.
	const tableRef = useRef<HTMLDivElement>(null);
	const [localActive, setLocalActive] = useState(-1);
	// The session whose read-only detail is shown in the docked panel; opened by
	// row click or `o`.
	const [viewEntry, setViewEntry] = useState<AgentEntry | null>(null);
	// While the panel is open its session drives the list (single source of
	// truth): the highlight follows it and ↑/↓ move the selection live. While
	// closed the list keeps its own j/k highlight. A viewed session that's no
	// longer a row (dropped by a period change) leaves the list on its local
	// highlight and the panel's counter/nav hidden.
	const panelIndex = viewEntry
		? list.findIndex((e) => e.id === viewEntry.id)
		: -1;
	const panelDrivesList = panelIndex >= 0;
	const active = panelDrivesList ? panelIndex : localActive;
	// Mirror the panel selection into the local highlight so closing the panel
	// leaves the highlight on the last-viewed row (j/k resumes from there).
	useEffect(() => {
		if (panelDrivesList) setLocalActive(panelIndex);
	}, [panelDrivesList, panelIndex]);
	// Bulk selection over the loaded rows. Only the raw id set is state; the
	// effective selection is its intersection with the loaded list, so rows
	// that vanish (deleted, or dropped by a period change) fall out on their own.
	const { session } = useRouteContext({ from: "/_authed" });
	const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const toggleSelected = (id: string, checked: boolean) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	};
	useListKeyboardNav({
		length: list.length,
		index: active,
		// The arrows are the panel's move keys while it's open; otherwise leave
		// them to the browser for page scrolling.
		arrowKeys: panelDrivesList,
		onMove: (next) => {
			const entry = list[next];
			if (!entry) return;
			if (panelDrivesList) setViewEntry(entry);
			else setLocalActive(next);
		},
		onOpen: () => {
			const entry = list[active];
			if (entry) setViewEntry(entry);
		},
		// `x` toggles the active row's checkbox — only where one is offered
		// (the viewer's own sessions; see the cell below).
		onToggle: () => {
			const entry = list[active];
			if (entry && entry.ownerUserId === session.user.id) {
				toggleSelected(entry.id, !selectedIds.has(entry.id));
			}
		},
		onReachEnd: loadMore,
		containerRef: tableRef,
	});
	const selectedEntries = useMemo(
		() => list.filter((entry) => selectedIds.has(entry.id)),
		[list, selectedIds],
	);
	const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
	// Both bulk actions are owner-only server-side, so selection is offered only
	// on the viewer's own sessions (an agent belongs to one user, so in practice
	// this is all rows or none). No selection in an archived workspace either —
	// both bulk actions are writes, which the server rejects there.
	const canSelect =
		!current?.archivedAt && list.some((e) => e.ownerUserId === session.user.id);
	// A work entry has one project, so a mixed-project selection can't become
	// one; null (unassigned) is its own group.
	const mixedProjects =
		new Set(selectedEntries.map((e) => e.projectId)).size > 1;
	const tooMany = selectedEntries.length > MAX_LINKED_AGENT_ENTRIES;
	const canLogWork = selectedEntries.length > 0 && !mixedProjects && !tooMany;

	// The global `c` shortcut consults this supplier, so it prefills exactly
	// like the button while a selection exists (and is inert while the selection
	// is invalid). State is read through a ref so the supplier registers once.
	const { openCreate, setCreatePrefillSource } = useEntryDialog();
	const selectionRef = useRef({ entries: selectedEntries, timezone });
	selectionRef.current = { entries: selectedEntries, timezone };
	useEffect(() => {
		setCreatePrefillSource(() => {
			const { entries, timezone: tz } = selectionRef.current;
			if (entries.length === 0) return null;
			if (
				new Set(entries.map((e) => e.projectId)).size > 1 ||
				entries.length > MAX_LINKED_AGENT_ENTRIES
			) {
				return { kind: "blocked" };
			}
			return {
				kind: "prefill",
				prefill: buildPrefill(entries, tz),
				onCreated: clearSelection,
			};
		});
		return () => setCreatePrefillSource(null);
	}, [setCreatePrefillSource, clearSelection]);

	// The set of session ids the open confirmation is about, frozen when the
	// dialog opens (null = closed): the confirm must delete exactly what the
	// dialog described, not whatever the live selection has drifted to.
	const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(
		null,
	);
	// `d` opens the delete confirmation while a selection exists, mirroring the
	// delete button (inert over the cap, like the button is disabled). Guarded
	// like the app's other global shortcuts; alertdialog covers this page's own
	// confirmation dialog.
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key !== "d" || e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.repeat || e.isComposing || e.defaultPrevented) return;
			if (isTypingTarget(e.target)) return;
			if (
				document.querySelector(
					'[role="dialog"], [role="alertdialog"], [role="menu"]',
				)
			) {
				return;
			}
			const { entries } = selectionRef.current;
			if (entries.length === 0 || entries.length > MAX_LINKED_AGENT_ENTRIES) {
				return;
			}
			e.preventDefault();
			setPendingDeleteIds(entries.map((entry) => entry.id));
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);
	const queryClient = useQueryClient();
	const deleteMutation = useMutation({
		mutationFn: (ids: string[]) =>
			api.deleteAgentEntries({ workspaceId: workspaceId as string, ids }),
		onSuccess: ({ count }, ids) => {
			toast.success(t("agents.selection.deletedToast", { count }));
			setPendingDeleteIds(null);
			clearSelection();
			setLocalActive(-1);
			setViewEntry((v) => (v && ids.includes(v.id) ? null : v));
			invalidateAgentEntryData(queryClient, workspaceId as string);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	if (!current) {
		return (
			<p className="text-muted-foreground p-4 text-sm">
				{t("workspace.empty.title")}
			</p>
		);
	}
	if (agents.isPending) {
		return (
			<p className="text-muted-foreground p-4 text-center text-sm">
				{t("app.loading")}
			</p>
		);
	}
	if (!agent) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
				<p className="text-muted-foreground text-sm">{t("agents.notFound")}</p>
				<Button asChild variant="outline">
					<Link to="/">{t("agents.backHome")}</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-7">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-center gap-2.5">
					<span className="bg-brand/10 text-brand flex size-8 shrink-0 items-center justify-center rounded-lg">
						<AgentTypeIcon type={agent.type} className="size-4" />
					</span>
					<h1 className="font-heading text-xl font-semibold tracking-tight">
						{agent.name}
					</h1>
					<Badge variant="secondary">
						{t(`settings.agents.types.${agent.type}`)}
					</Badge>
				</div>
				<PeriodSelector
					value={period}
					onChange={(next) => {
						// A period change rescopes the list; drop the open session so the
						// panel never lingers on a row the new range doesn't contain.
						setViewEntry(null);
						setPeriod(next);
					}}
				/>
			</div>

			<AgentStats workspaceId={current.id} agentId={agentId} period={period} />

			<section className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="font-heading text-lg font-semibold">
						{t("agents.entriesTitle")}
					</h2>
					{selectedEntries.length > 0 ? (
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-sm tabular-nums">
								{t("agents.selection.count", {
									count: selectedEntries.length,
								})}
							</span>
							{/* The button stays visible but inert while the selection can't
							    become one work entry, with the reason spelled out beside it
							    (the `c` shortcut is equally inert then). */}
							{mixedProjects ? (
								<span className="text-muted-foreground text-xs">
									{t("agents.selection.mixedProjects")}
								</span>
							) : tooMany ? (
								<span className="text-muted-foreground text-xs">
									{t("agents.selection.tooMany", {
										max: MAX_LINKED_AGENT_ENTRIES,
									})}
								</span>
							) : null}
							<Button
								size="sm"
								variant="outline"
								disabled={!canLogWork}
								onClick={() =>
									openCreate(buildPrefill(selectedEntries, timezone), {
										onCreated: clearSelection,
									})
								}
							>
								{t("agents.selection.logWork")}
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="text-destructive hover:text-destructive"
								disabled={tooMany}
								onClick={() =>
									setPendingDeleteIds(selectedEntries.map((entry) => entry.id))
								}
							>
								<Trash2Icon />
								{t("agents.selection.deleteAction")}
							</Button>
						</div>
					) : (
						/* Row count only once every page is loaded — a partial set would
						   read as a total when it's really "showing the first N". The
						   period's true session total is in the Sessions stat widget. */
						list.length > 0 &&
						!entries.hasNextPage && (
							<span className="text-muted-foreground text-sm tabular-nums">
								{t("agents.sessionCount", { count: list.length })}
							</span>
						)
					)}
				</div>
				{entries.isPending ? (
					<p className="text-muted-foreground p-4 text-center text-sm">
						{t("app.loading")}
					</p>
				) : list.length === 0 ? (
					<div className="text-muted-foreground flex flex-col items-center gap-3 px-5 py-16 text-center">
						<span className="bg-muted flex size-12 items-center justify-center rounded-full">
							<SparklesIcon className="size-5" />
						</span>
						<p className="text-sm">{t("agents.empty")}</p>
					</div>
				) : (
					<div ref={tableRef}>
						<Table>
							<TableHeader>
								<TableRow>
									{canSelect && (
										<TableHead className="w-8">
											<span className="sr-only">
												{t("agents.selection.selectEntry")}
											</span>
										</TableHead>
									)}
									<TableHead>{t("agents.table.date")}</TableHead>
									<TableHead className="w-full">
										{t("agents.table.description")}
									</TableHead>
									<TableHead>{t("agents.table.project")}</TableHead>
									<TableHead>{t("agents.table.model")}</TableHead>
									<TableHead className="text-right">
										{t("agents.table.duration")}
									</TableHead>
									<TableHead className="text-right">
										{t("agents.table.input")}
									</TableHead>
									<TableHead className="text-right">
										{t("agents.table.output")}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{list.map((entry, index) => {
									const project = entry.projectId
										? projectById.get(entry.projectId)
										: undefined;
									return (
										<TableRow
											key={entry.id}
											data-nav-index={index}
											data-nav-active={active === index ? "" : undefined}
											className="group data-[nav-active]:bg-muted relative cursor-pointer"
										>
											{canSelect && (
												<TableCell>
													{/* Lifted above the description button's stretched
													    row overlay so clicks land on the checkbox. Only
													    the viewer's own sessions are selectable (bulk
													    actions are owner-only). */}
													{entry.ownerUserId === session.user.id && (
														<Checkbox
															className="relative z-10 align-middle"
															aria-label={t("agents.selection.selectEntry")}
															checked={selectedIds.has(entry.id)}
															onCheckedChange={(checked) =>
																toggleSelected(entry.id, checked === true)
															}
														/>
													)}
												</TableCell>
											)}
											<TableCell className="whitespace-nowrap">
												<div>
													{formatEntryDate(entry.entryDate, i18n.language, {
														weekday: "short",
														month: "short",
														day: "numeric",
													})}
												</div>
												{entry.startedAt && entry.endedAt && (
													<div className="text-muted-foreground text-xs tabular-nums">
														{formatClock(entry.startedAt, timezone)}–
														{formatClock(entry.endedAt, timezone)}
													</div>
												)}
											</TableCell>
											<TableCell className="whitespace-normal break-words">
												{/* The whole row opens the detail dialog: this button's
											    stretched overlay (`before:inset-0`) covers the relative
											    row, keeping it keyboard-accessible with no click handler
											    on the <tr>. Ingest preserves an empty-string
											    description, so treat blank/whitespace as missing — the
											    em dash still opens, hence the aria-label. */}
												<button
													type="button"
													onClick={() => setViewEntry(entry)}
													aria-label={
														entry.description?.trim()
															? undefined
															: t("agents.detail.open")
													}
													className="flex text-left before:absolute before:inset-0 before:content-['']"
												>
													{entry.description?.trim() ? (
														<span className="min-w-0 break-words underline-offset-4 group-hover:underline">
															{entry.description}
														</span>
													) : (
														<span className="text-muted-foreground/40">—</span>
													)}
												</button>
											</TableCell>
											<TableCell className="whitespace-nowrap">
												<span className="flex items-center gap-1.5">
													{project && (
														<ProjectMarker
															hue={project.hue}
															symbol={project.symbol}
															size={12}
														/>
													)}
													{projectName(entry.projectId)}
												</span>
											</TableCell>
											<TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
												{entry.usage?.model ?? "—"}
											</TableCell>
											<TableCell className="text-right whitespace-nowrap tabular-nums">
												{formatDuration(entry.durationMinutes)}
											</TableCell>
											<TableCell className="text-muted-foreground text-right tabular-nums">
												{entry.usage?.inputTokens !== undefined
													? formatCompactNumber(entry.usage.inputTokens)
													: "—"}
											</TableCell>
											<TableCell className="text-muted-foreground text-right tabular-nums">
												{entry.usage?.outputTokens !== undefined
													? formatCompactNumber(entry.usage.outputTokens)
													: "—"}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
						<InfiniteSentinel
							hasNextPage={Boolean(entries.hasNextPage)}
							isFetchingNextPage={entries.isFetchingNextPage}
							fetchNextPage={entries.fetchNextPage}
						/>
					</div>
				)}
			</section>

			<AlertDialog
				open={pendingDeleteIds !== null}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteIds(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("agents.selection.deleteTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("agents.selection.deleteDescription", {
								count: pendingDeleteIds?.length ?? 0,
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{t("agents.selection.deleteCancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (pendingDeleteIds) deleteMutation.mutate(pendingDeleteIds);
							}}
						>
							{t("agents.selection.deleteConfirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{viewEntry && (
				<AgentEntryDetailPanel
					entry={viewEntry}
					agentType={agent.type}
					index={panelIndex}
					total={list.length}
					onPrev={
						panelIndex > 0
							? () => setViewEntry(list[panelIndex - 1] ?? null)
							: undefined
					}
					onNext={
						panelIndex >= 0 && panelIndex < list.length - 1
							? () => setViewEntry(list[panelIndex + 1] ?? null)
							: undefined
					}
					onClose={() => setViewEntry(null)}
					project={
						viewEntry.projectId
							? projectById.get(viewEntry.projectId)
							: undefined
					}
					projectName={projectName(viewEntry.projectId)}
					timezone={timezone}
				/>
			)}
		</div>
	);
}
