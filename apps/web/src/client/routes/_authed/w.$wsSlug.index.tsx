import { todayInTimezone } from "@spantail/core";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { HomeInbox } from "@/components/dashboard/home-inbox";
import {
	type DashboardPeriod,
	PeriodSelector,
} from "@/components/dashboard/period-selector";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useSpanDialog } from "@/components/span-dialog";
import { SpanTimeline } from "@/components/span-timeline";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { formatSpanDate } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authed/w/$wsSlug/")({
	component: Dashboard,
});

function Dashboard() {
	const { current } = useWorkspace();
	const { session } = Route.useRouteContext();

	// The parent layout redirects when the slug has no matching workspace, so
	// `current` resolves to this workspace by the time the dashboard renders.
	if (!current) return null;
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
	const { openCreate } = useSpanDialog();
	const navigate = useNavigate();
	const [period, setPeriod] = useState<DashboardPeriod>("this_month");
	const today = todayInTimezone(current?.timezone ?? "UTC");
	const dateLabel = formatSpanDate(today, i18n.language, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});
	const projects = useProjects();
	const spans = useInfiniteQuery({
		queryKey: ["work-spans", workspaceId, "timeline", userId],
		queryFn: ({ pageParam }) =>
			api.listWorkSpans({
				workspaceId,
				userId,
				limit: PAGE_SIZE,
				offset: pageParam,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
	});
	const allSpans = spans.data?.pages.flat() ?? [];

	return (
		<div className="flex flex-col gap-7">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-heading text-xl font-semibold tracking-tight">
						{t("nav.home")}
					</h1>
					<p className="text-muted-foreground mt-0.5 text-sm">
						{t("home.subtitle", { date: dateLabel })}
					</p>
				</div>
				<PeriodSelector value={period} onChange={setPeriod} />
			</div>
			<DashboardStats
				scope={{ workspaceId, userId }}
				breakdown="project"
				period={period}
				layout="stacked"
				aside={<HomeInbox />}
			/>
			<section className="flex flex-col gap-3">
				<h2 className="font-heading text-lg font-semibold">
					{t("timeline.title")}
				</h2>
				{spans.isPending ? (
					<p className="text-muted-foreground p-4 text-center text-sm">
						{t("app.loading")}
					</p>
				) : allSpans.length === 0 ? (
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
						<SpanTimeline
							spans={allSpans}
							projects={projects.data ?? []}
							onLoadMore={() => {
								if (spans.hasNextPage && !spans.isFetchingNextPage)
									spans.fetchNextPage();
							}}
							onCreateReport={(day) =>
								// Hand off to the reports shell, which opens a seeded create
								// dialog (daily template, scoped to just this day + this
								// workspace) from the search params — see ReportDialogsProvider.
								navigate({
									to: "/reports/$tab",
									params: { tab: "builtin:daily" },
									search: {
										create: "builtin:daily",
										from: day.date,
										to: day.date,
										ws: workspaceId,
									},
								})
							}
						/>
						<InfiniteSentinel
							hasNextPage={Boolean(spans.hasNextPage)}
							isFetchingNextPage={spans.isFetchingNextPage}
							fetchNextPage={() => spans.fetchNextPage()}
						/>
					</>
				)}
			</section>
		</div>
	);
}
