import {
	type AgentEntryStats,
	formatDuration,
	resolveDateRange,
	shiftDays,
} from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
	type DashboardPeriod,
	periodLabelKey,
} from "@/components/dashboard/period-selector";
import { daysInclusive, isWeekend } from "@/components/dashboard/stats-math";
import { Sparkline } from "@/components/sparkline";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import {
	formatCompactNumber,
	formatCompactRange,
	formatEntryDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

/** One zero-filled day of agent activity for the selected period. */
interface AgentDay {
	date: string;
	sessions: number;
	minutes: number;
	tokens: number;
	inputTokens: number;
	outputTokens: number;
	isWeekend: boolean;
}

// --- stat widgets -------------------------------------------------------

/** Icon tile-less stat card: label, big value, sub line, and a trend spark. */
function StatWidget({
	label,
	value,
	sub,
	spark,
}: {
	label: string;
	value: string;
	sub: string;
	spark: number[];
}) {
	return (
		<Card className="flex flex-col gap-2 p-4">
			<span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
				{label}
			</span>
			<span className="font-heading text-[1.6rem] leading-none font-semibold tracking-tight tabular-nums">
				{value}
			</span>
			<div className="flex items-end justify-between gap-3">
				<span className="text-muted-foreground text-xs">{sub}</span>
				<div className="text-brand w-20">
					<Sparkline values={spark} area height={22} />
				</div>
			</div>
		</Card>
	);
}

/** One Input/Output column inside {@link TokensWidget}. */
function TokenColumn({
	label,
	value,
	series,
	icon: Icon,
	opacity,
}: {
	label: string;
	value: string;
	series: number[];
	icon: LucideIcon;
	opacity: number;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<span className="font-heading text-[1.4rem] leading-none font-semibold tracking-tight tabular-nums">
				{value}
			</span>
			<span className="text-muted-foreground flex items-center gap-1 text-xs">
				<Icon className="text-brand size-3 shrink-0" style={{ opacity }} />
				<span className="font-medium tracking-wider uppercase">{label}</span>
			</span>
			<div className="text-brand mt-0.5" style={{ opacity }}>
				<Sparkline values={series} area height={22} />
			</div>
		</div>
	);
}

/** Tokens stat: Input and Output side by side, each value + spark. */
function TokensWidget({
	label,
	inputLabel,
	outputLabel,
	inputTotal,
	outputTotal,
	inSeries,
	outSeries,
}: {
	label: string;
	inputLabel: string;
	outputLabel: string;
	inputTotal: number;
	outputTotal: number;
	inSeries: number[];
	outSeries: number[];
}) {
	return (
		<Card className="flex flex-col gap-2.5 p-4">
			<span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
				{label}
			</span>
			<div className="grid grid-cols-2 gap-5">
				<TokenColumn
					label={inputLabel}
					value={formatCompactNumber(inputTotal)}
					series={inSeries}
					icon={ArrowDownIcon}
					opacity={0.45}
				/>
				<TokenColumn
					label={outputLabel}
					value={formatCompactNumber(outputTotal)}
					series={outSeries}
					icon={ArrowUpIcon}
					opacity={1}
				/>
			</div>
		</Card>
	);
}

// --- daily activity chart ----------------------------------------------

type Metric = "sessions" | "time" | "tokens";
const METRICS: Metric[] = ["sessions", "time", "tokens"];
// Plot height in px; shared by the bars and the hover-tooltip placement math.
const PLOT_HEIGHT = 104;

/**
 * Per-day bar chart with a Sessions / Time / Tokens toggle. Tokens renders
 * Input and Output as paired bars; the others render a single bar with an
 * average reference line. CSS bars (no chart library), matching the dashboard.
 */
function AgentActivityChart({
	days,
	totals,
	periodLabel,
	locale,
}: {
	days: AgentDay[];
	totals: AgentEntryStats;
	periodLabel: string;
	locale: string;
}) {
	const { t } = useTranslation();
	const [metric, setMetric] = useState<Metric>("sessions");
	const [hover, setHover] = useState<number | null>(null);

	const grouped = metric === "tokens";
	const tokenSeries = [
		{
			label: t("agents.input"),
			read: (d: AgentDay) => d.inputTokens,
			opacity: 0.4,
		},
		{
			label: t("agents.output"),
			read: (d: AgentDay) => d.outputTokens,
			opacity: 1,
		},
	];
	const readSingle = (d: AgentDay) =>
		metric === "time" ? d.minutes : d.sessions;
	const format = (n: number) =>
		metric === "tokens"
			? formatCompactNumber(n)
			: metric === "time"
				? formatDuration(n)
				: String(n);

	const max = grouped
		? Math.max(1, ...days.flatMap((d) => tokenSeries.map((s) => s.read(d))))
		: Math.max(1, ...days.map(readSingle));
	const singleValues = grouped ? null : days.map(readSingle);
	const nonZero = singleValues?.filter((v) => v > 0) ?? [];
	const avg = nonZero.length
		? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length)
		: 0;

	// Place the tooltip just above the hovered bar's tip (8px gap) rather than at
	// a fixed spot atop the plot, so it tracks the bar instead of floating away.
	const hoveredDay = hover === null ? undefined : days[hover];
	const hoveredFrac = hoveredDay
		? Math.min(
				1,
				grouped
					? Math.max(...tokenSeries.map((s) => s.read(hoveredDay) / max))
					: readSingle(hoveredDay) / max,
			)
		: 0;
	const tooltipTop = PLOT_HEIGHT * (1 - hoveredFrac) - 8;

	const totalLabel =
		metric === "tokens"
			? t("agents.tokensSplit", {
					input: formatCompactNumber(totals.totalInputTokens),
					output: formatCompactNumber(totals.totalOutputTokens),
				})
			: metric === "time"
				? formatDuration(totals.totalMinutes)
				: t("agents.sessionCount", { count: totals.entryCount });

	return (
		// overflow-visible so the hover tooltip can float above the bars without
		// being clipped by the card (Card defaults to overflow-hidden).
		<Card className="overflow-visible p-5">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-baseline gap-2">
					<h2 className="text-sm font-semibold">{t("agents.dailyActivity")}</h2>
					<span className="text-muted-foreground text-xs">
						{totalLabel} · {periodLabel}
					</span>
				</div>
				<div className="flex items-center gap-3">
					{grouped && (
						<div className="text-muted-foreground hidden items-center gap-3 text-[11px] sm:flex">
							<span className="flex items-center gap-1.5">
								<span className="bg-brand size-2 rounded-full opacity-40" />
								{t("agents.input")}
							</span>
							<span className="flex items-center gap-1.5">
								<span className="bg-brand size-2 rounded-full" />
								{t("agents.output")}
							</span>
						</div>
					)}
					<div className="bg-muted/50 inline-flex items-center rounded-lg border p-0.5 text-xs">
						{METRICS.map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => setMetric(m)}
								className={cn(
									"rounded-md px-2.5 py-1 font-medium transition-colors",
									metric === m
										? "bg-card text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t(`agents.metric.${m}`)}
							</button>
						))}
					</div>
				</div>
			</div>

			<div className="relative">
				<div
					className="flex items-end gap-[3px]"
					style={{ height: PLOT_HEIGHT }}
				>
					{days.map((d, i) => {
						const dim =
							hover === null ? (d.isWeekend ? 0.5 : 1) : hover === i ? 1 : 0.3;
						const detail = grouped
							? `${t("agents.input")} ${formatCompactNumber(d.inputTokens)} · ${t("agents.output")} ${formatCompactNumber(d.outputTokens)}`
							: format(readSingle(d));
						return (
							<button
								key={d.date}
								type="button"
								aria-label={`${formatEntryDate(d.date, locale)} · ${detail}`}
								className="group relative flex h-full flex-1 cursor-default flex-col justify-end"
								onMouseEnter={() => setHover(i)}
								onMouseLeave={() => setHover(null)}
								onFocus={() => setHover(i)}
								onBlur={() => setHover(null)}
							>
								{grouped ? (
									<div className="flex h-full items-end justify-center gap-px">
										{tokenSeries.map((s) => {
											const sv = s.read(d);
											return sv > 0 ? (
												<div
													key={s.label}
													className="bg-brand flex-1 rounded-[2px] transition-all"
													style={{
														height: `${(sv / max) * 100}%`,
														minHeight: 3,
														opacity: s.opacity * dim,
													}}
												/>
											) : (
												<div
													key={s.label}
													className="bg-border flex-1 rounded-[2px]"
													style={{ height: 2 }}
												/>
											);
										})}
									</div>
								) : singleValues?.[i] === 0 ? (
									<div
										className="bg-border w-full rounded-[3px]"
										style={{ height: 2 }}
									/>
								) : (
									<div
										className="bg-brand w-full rounded-[3px] transition-all"
										style={{
											height: `${((singleValues?.[i] ?? 0) / max) * 100}%`,
											minHeight: 3,
											opacity: dim,
										}}
									/>
								)}
							</button>
						);
					})}
				</div>

				{!grouped && avg > 0 && (
					<div
						className="border-foreground/30 pointer-events-none absolute inset-x-0 border-t border-dashed"
						style={{ bottom: `${(avg / max) * 100}%` }}
					>
						<span className="bg-card text-muted-foreground absolute -top-2 right-0 px-1 text-[10px]">
							{t("dashboard.avgLabel", { value: format(avg) })}
						</span>
					</div>
				)}

				<div className="mt-1.5 flex gap-[3px]">
					{days.map((d) => {
						const dayNum = Number(d.date.slice(8));
						// Label odd calendar days (not every other index) so the ticks stay
						// stable across custom ranges, matching the dashboard's daily bars.
						return (
							<div
								key={d.date}
								className="text-muted-foreground flex-1 text-center text-[10px] tabular-nums"
							>
								{dayNum % 2 === 1 ? dayNum : ""}
							</div>
						);
					})}
				</div>

				{hover !== null && (
					<div
						className="border-border bg-popover pointer-events-none absolute z-20 rounded-md border px-2.5 py-1.5 text-xs shadow-md"
						style={{
							left: `${((hover + 0.5) / days.length) * 100}%`,
							top: tooltipTop,
							transform: "translate(-50%,-100%)",
						}}
					>
						<div className="font-medium">
							{formatEntryDate(days[hover]?.date ?? "", locale, {
								weekday: "short",
								month: "short",
								day: "numeric",
							})}
						</div>
						{grouped ? (
							<div className="mt-0.5 flex flex-col gap-0.5">
								{tokenSeries.map((s) => {
									const day = days[hover];
									return (
										<div
											key={s.label}
											className="text-muted-foreground flex items-center gap-1.5 tabular-nums"
										>
											<span
												className="bg-brand size-2 rounded-full"
												style={{ opacity: s.opacity }}
											/>
											{s.label}
											<span className="text-foreground ml-auto pl-3 font-medium">
												{formatCompactNumber(day ? s.read(day) : 0)}
											</span>
										</div>
									);
								})}
							</div>
						) : (
							<div className="text-muted-foreground tabular-nums">
								{format(singleValues?.[hover] ?? 0)}
							</div>
						)}
					</div>
				)}
			</div>
		</Card>
	);
}

// --- public component ---------------------------------------------------

interface AgentStatsProps {
	workspaceId: string;
	agentId: string;
	/** Period scoping the widgets + chart, controlled by the parent's selector. */
	period: DashboardPeriod;
}

/**
 * Period-scoped agent activity: three stat widgets (Sessions, Session time,
 * Tokens) over a daily sparkline window, plus a daily-activity bar chart. The
 * range is resolved in the workspace timezone, matching {@link DashboardStats}.
 */
export function AgentStats({ workspaceId, agentId, period }: AgentStatsProps) {
	const { t, i18n } = useTranslation();
	const { current } = useWorkspace();
	const timezone = current?.timezone ?? "UTC";
	const range = resolveDateRange(period, timezone);
	const periodLabel =
		typeof period === "string"
			? t(periodLabelKey(period))
			: formatCompactRange(range.from, range.to, i18n.language);

	const stats = useQuery({
		queryKey: [
			"agent-entry-stats",
			workspaceId,
			agentId,
			{ from: range.from, to: range.to },
		],
		queryFn: () =>
			api.getAgentEntryStats({
				workspaceId,
				agentId,
				from: range.from,
				to: range.to,
			}),
	});

	if (stats.isPending) {
		return (
			<div className="flex flex-col gap-4">
				<div className="grid gap-4 sm:grid-cols-3">
					<Skeleton className="h-28" />
					<Skeleton className="h-28" />
					<Skeleton className="h-28" />
				</div>
				<Skeleton className="h-52" />
			</div>
		);
	}
	if (stats.isError) {
		return (
			<Card className="p-5">
				<p className="text-muted-foreground text-sm">{t("errors.generic")}</p>
			</Card>
		);
	}

	const data = stats.data;
	const byDate = new Map(data.byDate.map((row) => [row.date, row]));
	const length = daysInclusive(range.from, range.to);
	const days: AgentDay[] = Array.from({ length }, (_, i) => {
		const date = shiftDays(range.from, i);
		const row = byDate.get(date);
		return {
			date,
			sessions: row?.count ?? 0,
			minutes: row?.minutes ?? 0,
			tokens: row?.tokens ?? 0,
			inputTokens: row?.inputTokens ?? 0,
			outputTokens: row?.outputTokens ?? 0,
			isWeekend: isWeekend(date),
		};
	});

	const activeDays = days.filter((d) => d.sessions > 0).length;
	const avgPerDay = activeDays ? data.entryCount / activeDays : 0;
	const avgMinutes = data.entryCount
		? Math.round(data.totalMinutes / data.entryCount)
		: 0;

	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 sm:grid-cols-3">
				<StatWidget
					label={t("agents.entryCount")}
					value={data.entryCount.toLocaleString(i18n.language)}
					sub={t("agents.sessionsSub", {
						days: activeDays,
						perDay: avgPerDay.toFixed(1),
					})}
					spark={days.map((d) => d.sessions)}
				/>
				<StatWidget
					label={t("agents.sessionTime")}
					value={formatDuration(data.totalMinutes)}
					sub={t("agents.sessionTimeSub", { avg: formatDuration(avgMinutes) })}
					spark={days.map((d) => d.minutes)}
				/>
				<TokensWidget
					label={t("agents.totalTokens")}
					inputLabel={t("agents.input")}
					outputLabel={t("agents.output")}
					inputTotal={data.totalInputTokens}
					outputTotal={data.totalOutputTokens}
					inSeries={days.map((d) => d.inputTokens)}
					outSeries={days.map((d) => d.outputTokens)}
				/>
			</div>
			<AgentActivityChart
				days={days}
				totals={data}
				periodLabel={periodLabel}
				locale={i18n.language}
			/>
		</div>
	);
}
