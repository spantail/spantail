import { useQuery } from "@tanstack/react-query";
import { resolveDateRange } from "@toxil/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { DailyBars } from "@/components/dashboard/daily-bars";
import { Donut, type DonutItem } from "@/components/dashboard/donut";
import {
	type HomePeriod,
	periodLabelKey,
} from "@/components/dashboard/period-selector";
import {
	buildDailyWindow,
	type DateBucket,
	daysInclusive,
} from "@/components/dashboard/stats-math";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { hueFromString } from "@/lib/hue";
import { useWorkspace } from "@/lib/workspace";

interface DashboardScope {
	workspaceId: string;
	userId?: string;
	projectId?: string;
}

interface DashboardStatsProps {
	scope: DashboardScope;
	breakdown: "project" | "user";
	/** Period that scopes both widgets, controlled by the parent's selector. */
	period: HomePeriod;
	/**
	 * `split` (default): daily chart + donut side by side.
	 * `stacked`: full-width daily chart, then donut + `aside` in a 2-col row.
	 */
	layout?: "split" | "stacked";
	/** Extra widget shown beside the donut in `stacked` layout (e.g. inbox). */
	aside?: ReactNode;
}

/**
 * Daily focus chart + breakdown donut for a scope and period. Date windows are
 * resolved in the workspace timezone with the same calendar helpers reports
 * use; the stats endpoint itself is a plain filtered aggregation.
 */
export function DashboardStats({
	scope,
	breakdown,
	period,
	layout = "split",
	aside,
}: DashboardStatsProps) {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const timezone = current?.timezone ?? "UTC";
	const range = resolveDateRange(period, timezone);
	const periodLabel = t(periodLabelKey(period));

	const stats = useQuery({
		queryKey: [
			"work-entry-stats",
			scope.workspaceId,
			{ ...scope, from: range.from, to: range.to },
		],
		queryFn: () =>
			api.getWorkEntryStats({ ...scope, from: range.from, to: range.to }),
	});

	const projects = useProjects();
	const members = useQuery({
		queryKey: ["members", scope.workspaceId],
		queryFn: () => api.listMembers(scope.workspaceId),
		enabled: breakdown === "user",
	});

	const chartCol = layout === "split" ? "lg:col-span-3" : undefined;
	// The donut keeps the same 2/5 width in both layouts; in `stacked` the row is
	// a 5-col grid (donut + 3-col aside), matching the project detail "By member".
	const donutCol = "lg:col-span-2";

	// Arrange the two widgets per layout. The aside renders in both states so
	// the inbox shows immediately rather than waiting on the stats query.
	const wrap = (chart: ReactNode, donut: ReactNode) =>
		layout === "stacked" ? (
			<div className="flex flex-col gap-4">
				{chart}
				<div className="grid gap-4 lg:grid-cols-5">
					{donut}
					<div className="lg:col-span-3">{aside}</div>
				</div>
			</div>
		) : (
			<div className="grid gap-4 lg:grid-cols-5">
				{chart}
				{donut}
			</div>
		);

	if (stats.isPending) {
		return wrap(
			<Skeleton className={chartCol ? `h-52 ${chartCol}` : "h-52"} />,
			<Skeleton className={donutCol ? `h-52 ${donutCol}` : "h-52"} />,
		);
	}
	if (stats.isError) {
		return wrap(
			<Card className={chartCol}>
				<CardContent>
					<p className="text-muted-foreground text-sm">{t("errors.generic")}</p>
				</CardContent>
			</Card>,
			null,
		);
	}

	const data = stats.data;
	const byDate = new Map<string, DateBucket>(
		data.byDate.map((row) => [row.date, row]),
	);
	const daily = buildDailyWindow(
		byDate,
		range.from,
		daysInclusive(range.from, range.to),
	);
	const total = data.totalMinutes;

	const projectById = (id: string | null) =>
		id ? projects.data?.find((p) => p.id === id) : undefined;
	const memberName = (id: string) =>
		members.data?.find((m) => m.userId === id)?.name ?? id;

	const donutItems: DonutItem[] =
		breakdown === "project"
			? data.byProject.map((row) => ({
					key: row.projectId ?? "__unassigned__",
					// Only a null projectId is truly unassigned; a non-null id that
					// the (possibly still-loading) project list can't resolve falls
					// back to the id, never mislabeled as "No project".
					label:
						row.projectId === null
							? t("projects.unassigned")
							: (projectById(row.projectId)?.name ?? row.projectId),
					minutes: row.minutes,
					hue: projectById(row.projectId)?.hue ?? null,
				}))
			: data.byUser.map((row) => ({
					key: row.userId,
					label: memberName(row.userId),
					minutes: row.minutes,
					hue: hueFromString(memberName(row.userId)),
				}));

	return wrap(
		<DailyBars
			daily={daily}
			total={total}
			periodLabel={periodLabel}
			barClassName="bg-brand"
			className={chartCol}
		/>,
		<Donut
			title={t(
				breakdown === "project" ? "dashboard.byProject" : "dashboard.byUser",
			)}
			periodLabel={periodLabel}
			items={donutItems}
			total={total}
			className={donutCol}
		/>,
	);
}
