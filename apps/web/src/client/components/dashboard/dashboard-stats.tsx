import { useQuery } from "@tanstack/react-query";
import {
	formatDuration,
	resolveDateRange,
	shiftDays,
	todayInTimezone,
} from "@toxil/core";
import { useTranslation } from "react-i18next";

import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import { DailyBars } from "@/components/dashboard/daily-bars";
import {
	type StatBucket,
	type StatCardData,
	StatCards,
} from "@/components/dashboard/stat-cards";
import {
	buildDailyWindow,
	daysInclusive,
	pctDelta,
	sumWindow,
} from "@/components/dashboard/stats-math";
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
const RECENT_DAYS = 28;

/**
 * Stat cards + recent charts for a scope. Date windows are computed here in the
 * workspace timezone with the same calendar helpers reports use; the stats
 * endpoint itself is a plain filtered aggregation.
 *
 * Period deltas compare like-for-like elapsed windows (today vs. yesterday,
 * week/month to-date vs. the same span a period earlier) so a partway-through
 * period isn't unfairly compared against a completed one.
 */
export function DashboardStats({ scope, breakdown }: DashboardStatsProps) {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const timezone = current?.timezone ?? "UTC";
	const today = todayInTimezone(timezone);
	const yesterday = shiftDays(today, -1);
	const recentFrom = shiftDays(today, -(RECENT_DAYS - 1));
	const week = resolveDateRange("this_week", timezone);
	const lastWeek = resolveDateRange("last_week", timezone);
	const month = resolveDateRange("this_month", timezone);
	const lastMonth = resolveDateRange("last_month", timezone);

	// 28-day window feeds the daily bars, sparklines, and the today/week cards
	// (incl. last week, which always falls inside it); the month window feeds
	// the this-month card and the breakdown exactly.
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
	// Best-effort: powers the month delta only, so the view never blocks on it.
	const lastMonthly = useQuery({
		queryKey: [
			"work-entry-stats",
			scope.workspaceId,
			{ ...scope, from: lastMonth.from, to: lastMonth.to },
		],
		queryFn: () =>
			api.getWorkEntryStats({
				...scope,
				from: lastMonth.from,
				to: lastMonth.to,
			}),
	});

	const projects = useProjects();
	const members = useQuery({
		queryKey: ["members", scope.workspaceId],
		queryFn: () => api.listMembers(scope.workspaceId),
		enabled: breakdown === "user",
	});

	if (recent.isPending || monthly.isPending) {
		return (
			<div className="flex flex-col gap-7">
				<div className="grid gap-4 sm:grid-cols-3">
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
				</div>
				<div className="grid gap-4 lg:grid-cols-5">
					<Skeleton className="h-52 lg:col-span-3" />
					<Skeleton className="h-52 lg:col-span-2" />
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
	const bucketOf = (row?: StatBucket): StatBucket =>
		row ? { minutes: row.minutes, count: row.count } : ZERO;

	const todayBucket = bucketOf(byDate.get(today));
	const yesterdayMinutes = byDate.get(yesterday)?.minutes ?? 0;

	// Week/month comparisons line up the same elapsed span a period earlier.
	const thisWeek = sumWindow(recent.data.byDate, week.from, today);
	const lastWeekToDate = sumWindow(
		recent.data.byDate,
		lastWeek.from,
		shiftDays(today, -7),
	);
	const monthMinutes = monthly.data.totalMinutes;
	// Card value is the whole month; the delta compares to-date vs. to-date so
	// future-dated entries (or a partway month) don't inflate it.
	const monthToDate = sumWindow(monthly.data.byDate, month.from, today).minutes;
	const elapsedDays = daysInclusive(month.from, today);
	const lastMonthEnd = shiftDays(lastMonth.from, elapsedDays - 1);
	const lastMonthToDate = sumWindow(
		lastMonthly.data?.byDate ?? [],
		lastMonth.from,
		lastMonthEnd < lastMonth.to ? lastMonthEnd : lastMonth.to,
	).minutes;

	const daily = buildDailyWindow(byDate, recentFrom, RECENT_DAYS);
	const spark = daily.map((d) => d.minutes);

	const cards: StatCardData[] = [
		{
			key: "today",
			label: t("dashboard.today"),
			value: formatDuration(todayBucket.minutes),
			sub: t("dashboard.entryCount", { count: todayBucket.count }),
			delta: pctDelta(todayBucket.minutes, yesterdayMinutes),
			spark: spark.slice(-7),
		},
		{
			key: "week",
			label: t("dashboard.thisWeek"),
			value: formatDuration(thisWeek.minutes),
			sub: t("dashboard.vsLastWeek", {
				duration: formatDuration(lastWeekToDate.minutes),
			}),
			delta: pctDelta(thisWeek.minutes, lastWeekToDate.minutes),
			spark: spark.slice(-14),
		},
		{
			key: "month",
			label: t("dashboard.thisMonth"),
			value: formatDuration(monthMinutes),
			sub: t("dashboard.entryCount", { count: monthly.data.entryCount }),
			delta: lastMonthly.data ? pctDelta(monthToDate, lastMonthToDate) : null,
			spark,
		},
	];

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
		<div className="flex flex-col gap-7">
			<StatCards cards={cards} />
			<div className="grid gap-4 lg:grid-cols-5">
				<DailyBars daily={daily} className="lg:col-span-3" />
				<BreakdownBars
					className="lg:col-span-2"
					title={t(
						breakdown === "project"
							? "dashboard.byProject"
							: "dashboard.byUser",
					)}
					subtitle={t("dashboard.totalThisMonth", {
						total: formatDuration(monthMinutes),
					})}
					items={items}
				/>
			</div>
		</div>
	);
}
