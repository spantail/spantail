import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { todayInTimezone } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { useEntryDialog } from "@/components/entry-dialog";
import { EntryTimeline } from "@/components/entry-timeline";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { formatEntryDate } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authed/")({
	component: Home,
});

function Home() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const { session } = Route.useRouteContext();
	const [createOpen, setCreateOpen] = useState(false);

	if (!current) {
		const isAdmin = Boolean(session.user.isAdmin);
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
				<h2 className="font-heading text-xl font-semibold">
					{t("workspace.empty.title")}
				</h2>
				<p className="text-muted-foreground max-w-md text-sm">
					{isAdmin ? t("workspace.empty.admin") : t("workspace.empty.member")}
				</p>
				{isAdmin && (
					<>
						<Button className="mt-2" onClick={() => setCreateOpen(true)}>
							{t("workspace.createAction")}
						</Button>
						<CreateWorkspaceDialog
							open={createOpen}
							onOpenChange={setCreateOpen}
						/>
					</>
				)}
			</div>
		);
	}

	return <Timeline workspaceId={current.id} userId={session.user.id} />;
}

function Timeline({
	workspaceId,
	userId,
}: {
	workspaceId: string;
	userId: string;
}) {
	const { t, i18n } = useTranslation();
	const { current } = useWorkspace();
	const { openCreate } = useEntryDialog();
	const today = todayInTimezone(current?.timezone ?? "UTC");
	const dateLabel = formatEntryDate(today, i18n.language, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});
	const projects = useProjects();
	const entries = useInfiniteQuery({
		queryKey: ["work-entries", workspaceId, "timeline", userId],
		queryFn: ({ pageParam }) =>
			api.listWorkEntries({
				workspaceId,
				userId,
				limit: PAGE_SIZE,
				offset: pageParam,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
	});
	const allEntries = entries.data?.pages.flat() ?? [];

	return (
		<div className="flex flex-col gap-7">
			<div>
				<h1 className="font-heading text-xl font-semibold tracking-tight">
					{t("nav.home")}
				</h1>
				<p className="text-muted-foreground mt-0.5 text-sm">
					{t("home.subtitle", { date: dateLabel })}
				</p>
			</div>
			<DashboardStats scope={{ workspaceId, userId }} breakdown="project" />
			<section className="flex flex-col gap-3">
				<h2 className="font-heading text-lg font-semibold">
					{t("timeline.title")}
				</h2>
				{entries.isPending ? (
					<p className="text-muted-foreground p-4 text-center text-sm">
						{t("app.loading")}
					</p>
				) : allEntries.length === 0 ? (
					<div className="flex flex-col items-center gap-2 p-8 text-center">
						<p className="text-muted-foreground text-sm">
							{t("timeline.empty")}
						</p>
						<Button onClick={() => openCreate()}>
							{t("timeline.emptyCta")}
						</Button>
						<p className="text-muted-foreground text-xs">
							{t("timeline.shortcutHint")}
						</p>
					</div>
				) : (
					<>
						<EntryTimeline
							entries={allEntries}
							projects={projects.data ?? []}
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
