import { formatDuration, resolveDateRange } from "@spantail/core";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentTypeIcon } from "@/components/agent-icon";
import { AgentStats } from "@/components/agent-stats";
import {
	type DashboardPeriod,
	PeriodSelector,
} from "@/components/dashboard/period-selector";
import { Dot } from "@/components/dot";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/document-title";
import { formatClock, formatCompactNumber } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";

// Page size for the in-range sessions table, loaded incrementally on scroll.
const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authed/w/$wsSlug/agents/$agentId")({
	component: AgentPage,
});

function AgentPage() {
	const { t } = useTranslation();
	const { agentId } = Route.useParams();
	const { current } = useWorkspace();
	const workspaceId = current?.id;
	const timezone = current?.timezone ?? "UTC";

	const [period, setPeriod] = useState<DashboardPeriod>("this_month");
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
	const projectHue = (id: string | null) =>
		id ? projectById.get(id)?.hue : undefined;

	const entries = useInfiniteQuery({
		queryKey: [
			"agent-entries",
			workspaceId,
			agentId,
			{ from: range.from, to: range.to },
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
	const list = entries.data?.pages.flat() ?? [];
	const loadMore = () => {
		if (entries.hasNextPage && !entries.isFetchingNextPage)
			entries.fetchNextPage();
	};

	// Vim-style j/k navigation over the loaded session rows; j at the last row
	// pulls the next page so keyboard users aren't stuck at the scroll sentinel.
	const tableRef = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState(-1);
	useListKeyboardNav({
		length: list.length,
		index: active,
		onMove: setActive,
		onReachEnd: loadMore,
		containerRef: tableRef,
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
				<PeriodSelector value={period} onChange={setPeriod} />
			</div>

			<AgentStats workspaceId={current.id} agentId={agentId} period={period} />

			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-3">
					<h2 className="font-heading text-lg font-semibold">
						{t("agents.entriesTitle")}
					</h2>
					{/* Row count only once every page is loaded — a partial set would
					    read as a total when it's really "showing the first N". The
					    period's true session total is in the Sessions stat widget. */}
					{list.length > 0 && !entries.hasNextPage && (
						<span className="text-muted-foreground text-sm tabular-nums">
							{t("agents.sessionCount", { count: list.length })}
						</span>
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
									<TableHead>{t("agents.table.date")}</TableHead>
									<TableHead>{t("agents.table.description")}</TableHead>
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
									const hue = projectHue(entry.projectId);
									return (
										<TableRow
											key={entry.id}
											data-nav-index={index}
											data-nav-active={active === index ? "" : undefined}
											className="data-[nav-active]:bg-muted"
										>
											<TableCell className="whitespace-nowrap">
												<div className="tabular-nums">{entry.entryDate}</div>
												{entry.startedAt && entry.endedAt && (
													<div className="text-muted-foreground text-xs tabular-nums">
														{formatClock(entry.startedAt, timezone)}–
														{formatClock(entry.endedAt, timezone)}
													</div>
												)}
											</TableCell>
											<TableCell>
												{/* Ingest preserves an empty-string description, so treat
											    blank/whitespace as missing to show the em dash. */}
												{entry.description?.trim() ? (
													entry.description
												) : (
													<span className="text-muted-foreground/40">—</span>
												)}
											</TableCell>
											<TableCell className="whitespace-nowrap">
												<span className="flex items-center gap-1.5">
													{hue !== undefined && <Dot hue={hue} size={6} />}
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
							fetchNextPage={() => entries.fetchNextPage()}
						/>
					</div>
				)}
			</section>
		</div>
	);
}
