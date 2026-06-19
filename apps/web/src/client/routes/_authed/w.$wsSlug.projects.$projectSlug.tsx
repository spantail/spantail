import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatPeriodLabel } from "@toxil/core";
import { SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { Dot } from "@/components/dot";
import { EntryList } from "@/components/entry-list";
import { FilterChip } from "@/components/filter-chip";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { Badge } from "@/components/ui/badge";
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
import { useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { hueFromString } from "@/lib/hue";
import { useWorkspace } from "@/lib/workspace";

const PAGE_SIZE = 50;

// Radix Select values must be unique and non-empty, but a tag can be any
// non-empty string (even "all"), so real tags are prefixed to stay distinct
// from the "all tags" sentinel.
const TAG_ALL = "all";
const TAG_PREFIX = "t:";

export const Route = createFileRoute(
	"/_authed/w/$wsSlug/projects/$projectSlug",
)({
	component: ProjectPage,
});

function ProjectPage() {
	const { t } = useTranslation();
	const { projectSlug } = Route.useParams();
	const { current } = useWorkspace();

	const workspaceId = current?.id;
	// The project is resolved from the workspace's project list (the same query
	// the sidebar loads), so a slug outside this workspace simply isn't found —
	// there is no cross-workspace data to guard against.
	const projects = useProjects();
	const project = (projects.data ?? []).find((p) => p.slug === projectSlug);

	const members = useQuery({
		queryKey: ["members", workspaceId],
		queryFn: () => api.listMembers(workspaceId as string),
		enabled: Boolean(workspaceId),
	});

	// Entry filters (local state). Like the Reports filter they live in a
	// popover and are off by default: empty dates and a null member/tag keep
	// every entry. They flow into the server query so results stay correct
	// across the entry list's pagination.
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [member, setMember] = useState<string | null>(null);
	const [tag, setTag] = useState<string | null>(null);

	// Tag options come from a distinct-tags catalog scoped to this project, so
	// the dropdown is complete regardless of how many entry pages are loaded.
	const tags = useQuery({
		queryKey: ["work-entry-tags", workspaceId, project?.id],
		queryFn: () =>
			api.listWorkEntryTags({
				workspaceId: workspaceId as string,
				projectId: project?.id as string,
			}),
		enabled: Boolean(workspaceId) && Boolean(project),
	});

	const entries = useInfiniteQuery({
		queryKey: [
			"work-entries",
			workspaceId,
			"project",
			project?.id,
			{ from, to, member, tag },
		],
		queryFn: ({ pageParam }) =>
			api.listWorkEntries({
				workspaceId: workspaceId as string,
				projectId: project?.id as string,
				userId: member ?? undefined,
				tag: tag ?? undefined,
				from: from || undefined,
				to: to || undefined,
				limit: PAGE_SIZE,
				offset: pageParam,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
		enabled: Boolean(workspaceId) && Boolean(project),
	});

	if (!current) {
		return (
			<p className="text-muted-foreground p-4 text-sm">
				{t("workspace.empty.title")}
			</p>
		);
	}
	if (projects.isPending) {
		return (
			<p className="text-muted-foreground p-4 text-center text-sm">
				{t("app.loading")}
			</p>
		);
	}
	if (!project) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
				<p className="text-muted-foreground text-sm">
					{t("projects.notFound")}
				</p>
				<Button asChild variant="outline">
					<Link to="/">{t("projects.backHome")}</Link>
				</Button>
			</div>
		);
	}

	const allEntries = entries.data?.pages.flat() ?? [];

	const memberOptions = members.data ?? [];
	const memberName = (id: string) =>
		memberOptions.find((m) => m.userId === id)?.name ?? id;
	const tagOptions = tags.data ?? [];

	const periodActive = from !== "" || to !== "";
	const memberActive = member !== null;
	const tagActive = tag !== null;
	const activeFilterCount =
		(periodActive ? 1 : 0) + (memberActive ? 1 : 0) + (tagActive ? 1 : 0);
	const periodLabel =
		from && to
			? formatPeriodLabel({ from, to })
			: from
				? `${t("reports.from")} ${from}`
				: `${t("reports.to")} ${to}`;
	const clearFilters = () => {
		setFrom("");
		setTo("");
		setMember(null);
		setTag(null);
	};

	return (
		<div className="flex flex-col gap-7">
			{/* No page-level log button: the header one pre-selects this project. */}
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center gap-2">
					<Dot hue={hueFromString(project.id)} size={10} />
					<h1 className="font-heading text-xl font-semibold tracking-tight">
						{project.name}
					</h1>
					<Badge
						variant={project.status === "active" ? "outline" : "secondary"}
					>
						{t(`settings.projects.status.${project.status}`)}
					</Badge>
				</div>
				{project.description && (
					<p className="text-muted-foreground text-sm">{project.description}</p>
				)}
			</div>
			<DashboardStats
				scope={{ workspaceId: current.id, projectId: project.id }}
				breakdown="user"
			/>
			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-3">
					<h2 className="font-heading text-lg font-semibold">
						{t("projects.entriesTitle")}
					</h2>
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
										<Label htmlFor="entries-from" className="text-xs">
											{t("reports.from")}
										</Label>
										<Input
											id="entries-from"
											type="date"
											className="h-9 [color-scheme:light] dark:[color-scheme:dark]"
											value={from}
											max={to || undefined}
											onChange={(e) => setFrom(e.target.value)}
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="entries-to" className="text-xs">
											{t("reports.to")}
										</Label>
										<Input
											id="entries-to"
											type="date"
											className="h-9 [color-scheme:light] dark:[color-scheme:dark]"
											value={to}
											min={from || undefined}
											onChange={(e) => setTo(e.target.value)}
										/>
									</div>
								</div>
								{memberOptions.length > 0 && (
									<div className="flex flex-col gap-1.5">
										<Label className="text-xs">
											{t("entries.filter.member")}
										</Label>
										<Select
											value={member ?? "all"}
											onValueChange={(v) => setMember(v === "all" ? null : v)}
										>
											<SelectTrigger className="h-9 w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">
													{t("entries.filter.allMembers")}
												</SelectItem>
												{memberOptions.map((m) => (
													<SelectItem key={m.userId} value={m.userId}>
														{m.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
								{tagOptions.length > 0 && (
									<div className="flex flex-col gap-1.5">
										<Label className="text-xs">{t("entries.filter.tag")}</Label>
										<Select
											value={tag === null ? TAG_ALL : `${TAG_PREFIX}${tag}`}
											onValueChange={(v) =>
												setTag(
													v === TAG_ALL ? null : v.slice(TAG_PREFIX.length),
												)
											}
										>
											<SelectTrigger className="h-9 w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={TAG_ALL}>
													{t("entries.filter.allTags")}
												</SelectItem>
												{tagOptions.map((option) => (
													<SelectItem
														key={option}
														value={`${TAG_PREFIX}${option}`}
													>
														{option}
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
						{member !== null && (
							<FilterChip
								label={memberName(member)}
								removeLabel={t("reports.filter.remove")}
								onClear={() => setMember(null)}
							/>
						)}
						{tag !== null && (
							<FilterChip
								label={`#${tag}`}
								removeLabel={t("reports.filter.remove")}
								onClear={() => setTag(null)}
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
				{entries.isPending ? (
					<p className="text-muted-foreground p-4 text-center text-sm">
						{t("app.loading")}
					</p>
				) : allEntries.length === 0 && activeFilterCount > 0 ? (
					<p className="text-muted-foreground p-4 text-center text-sm">
						{t("entries.filter.empty")}
					</p>
				) : (
					<>
						<EntryList
							entries={allEntries}
							projects={[project]}
							members={members.data ?? []}
							showProject={false}
							onLoadMore={() => {
								if (entries.hasNextPage && !entries.isFetchingNextPage)
									entries.fetchNextPage();
							}}
						/>
						<InfiniteSentinel
							hasNextPage={Boolean(entries.hasNextPage)}
							isFetchingNextPage={entries.isFetchingNextPage}
							fetchNextPage={() => entries.fetchNextPage()}
						/>
					</>
				)}
			</section>
		</div>
	);
}
