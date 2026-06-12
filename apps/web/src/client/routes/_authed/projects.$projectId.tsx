import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { useEntryDialog } from "@/components/entry-dialog";
import { EntryList } from "@/components/entry-list";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authed/projects/$projectId")({
	component: ProjectPage,
});

function ProjectPage() {
	const { t } = useTranslation();
	const { projectId } = Route.useParams();
	const { current } = useWorkspace();
	const navigate = Route.useNavigate();
	const { openCreate } = useEntryDialog();

	const workspaceId = current?.id;
	const project = useQuery({
		queryKey: ["project", projectId],
		queryFn: () => api.getProject(projectId),
	});
	// True on a foreign-workspace link and when the workspace switcher moves
	// away mid-view; either way this page must not show foreign data.
	const mismatch = Boolean(
		project.data && workspaceId && project.data.workspaceId !== workspaceId,
	);

	useEffect(() => {
		if (mismatch) navigate({ to: "/" });
	}, [mismatch, navigate]);

	const members = useQuery({
		queryKey: ["members", workspaceId],
		queryFn: () => api.listMembers(workspaceId as string),
		enabled: Boolean(workspaceId),
	});
	const entries = useInfiniteQuery({
		queryKey: ["work-entries", workspaceId, "project", projectId],
		queryFn: ({ pageParam }) =>
			api.listWorkEntries({
				workspaceId: workspaceId as string,
				projectId,
				limit: PAGE_SIZE,
				offset: pageParam,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
		enabled: Boolean(workspaceId) && !mismatch,
	});

	if (!current) {
		return (
			<p className="text-muted-foreground p-4 text-sm">
				{t("workspace.empty.title")}
			</p>
		);
	}
	if (project.isError) {
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
	if (project.isPending || mismatch) {
		return (
			<p className="text-muted-foreground p-4 text-center text-sm">
				{t("app.loading")}
			</p>
		);
	}

	const allEntries = entries.data?.pages.flat() ?? [];

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<h1 className="font-heading text-lg font-semibold">
							{project.data.name}
						</h1>
						<Badge
							variant={
								project.data.status === "active" ? "outline" : "secondary"
							}
						>
							{t(`settings.projects.status.${project.data.status}`)}
						</Badge>
					</div>
					{project.data.description && (
						<p className="text-muted-foreground text-sm">
							{project.data.description}
						</p>
					)}
				</div>
				{project.data.status === "active" && (
					<Button size="sm" onClick={() => openCreate({ projectId })}>
						<PlusIcon />
						{t("nav.logWork")}
					</Button>
				)}
			</div>
			<DashboardStats
				scope={{ workspaceId: current.id, projectId }}
				breakdown="user"
			/>
			<section className="flex flex-col gap-3">
				<h2 className="font-heading text-base font-semibold">
					{t("projects.entriesTitle")}
				</h2>
				{entries.isPending ? (
					<p className="text-muted-foreground p-4 text-center text-sm">
						{t("app.loading")}
					</p>
				) : (
					<>
						<EntryList
							entries={allEntries}
							projects={project.data ? [project.data] : []}
							members={members.data ?? []}
							showProject={false}
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
