import { useQuery } from "@tanstack/react-query";
import { resolveDateRange, shiftDays, todayInTimezone } from "@toxil/core";
import { useTranslation } from "react-i18next";

import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import { DailyBars } from "@/components/dashboard/daily-bars";
import { type StatBucket, StatCards } from "@/components/dashboard/stat-cards";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

interface DashboardScope {
	workspaceId: string;
	userId?: string;
	projectId?: string;
}

interface DashboardStatsProps {
	scope: DashboardScope;
	breakdown: "project" | "user";
}

const ZERO: StatBucket = { minutes: 0, count: 0 };

/**
 * Stat cards + recent bars for a scope. Date windows are computed here in
 * the workspace timezone with the same calendar helpers reports use; the
 * stats endpoint itself is a plain filtered aggregation.
 */
export function DashboardStats({ scope, breakdown }: DashboardStatsProps) {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const timezone = current?.timezone ?? "UTC";
	const today = todayInTimezone(timezone);
	const recentFrom = shiftDays(today, -13);
	const week = resolveDateRange("this_week", timezone);
	const month = resolveDateRange("this_month", timezone);

	// Two windows: the 14-day one feeds today/this-week cards and the daily
	// bars (a Monday week start is always within it); the month one feeds the
	// this-month card and the breakdown exactly.
	const recent = useQuery({
		queryKey: [
			"work-entry-stats",
			scope.workspaceId,
			{ ...scope, from: recentFrom, to: today },
		],
		queryFn: () =>
			api.getWorkEntryStats({ ...scope, from: recentFrom, to: today }),
	});
	const monthly = useQuery({
		queryKey: [
			"work-entry-stats",
			scope.workspaceId,
			{ ...scope, from: month.from, to: month.to },
		],
		queryFn: () =>
			api.getWorkEntryStats({ ...scope, from: month.from, to: month.to }),
	});

	const projects = useProjects();
	const members = useQuery({
		queryKey: ["members", scope.workspaceId],
		queryFn: () => api.listMembers(scope.workspaceId),
		enabled: breakdown === "user",
	});

	if (recent.isPending || monthly.isPending) {
		return (
			<div className="grid gap-4">
				<div className="grid gap-4 sm:grid-cols-3">
					<Skeleton className="h-28" />
					<Skeleton className="h-28" />
					<Skeleton className="h-28" />
				</div>
				<div className="grid gap-4 lg:grid-cols-2">
					<Skeleton className="h-44" />
					<Skeleton className="h-44" />
				</div>
			</div>
		);
	}
	if (recent.isError || monthly.isError || !recent.data || !monthly.data) {
		return (
			<p className="text-muted-foreground text-sm">{t("errors.generic")}</p>
		);
	}

	const byDate = new Map(recent.data.byDate.map((row) => [row.date, row]));
	const bucketOf = (row?: { minutes: number; count: number }) =>
		row ? { minutes: row.minutes, count: row.count } : ZERO;
	const sumFrom = (from: string): StatBucket =>
		recent.data.byDate.reduce(
			(acc, row) =>
				row.date >= from
					? { minutes: acc.minutes + row.minutes, count: acc.count + row.count }
					: acc,
			ZERO,
		);
	const daily = Array.from({ length: 14 }, (_, i) => {
		const date = shiftDays(recentFrom, i);
		return { date, ...bucketOf(byDate.get(date)) };
	});

	const projectName = (id: string) =>
		projects.data?.find((p) => p.id === id)?.name ?? id;
	const memberName = (id: string) =>
		members.data?.find((m) => m.userId === id)?.name ?? id;
	const items =
		breakdown === "project"
			? monthly.data.byProject.map((row) => ({
					key: row.projectId,
					label: projectName(row.projectId),
					minutes: row.minutes,
				}))
			: monthly.data.byUser.map((row) => ({
					key: row.userId,
					label: memberName(row.userId),
					minutes: row.minutes,
				}));

	return (
		<div className="grid gap-4">
			<StatCards
				today={bucketOf(byDate.get(today))}
				thisWeek={sumFrom(week.from)}
				thisMonth={{
					minutes: monthly.data.totalMinutes,
					count: monthly.data.entryCount,
				}}
			/>
			<div className="grid gap-4 lg:grid-cols-2">
				<DailyBars daily={daily} />
				<BreakdownBars
					title={t(
						breakdown === "project"
							? "dashboard.byProject"
							: "dashboard.byUser",
					)}
					items={items}
				/>
			</div>
		</div>
	);
}
