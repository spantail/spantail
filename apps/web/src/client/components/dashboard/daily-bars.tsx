import { formatDuration } from "@spantail/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { DailyBar } from "@/components/dashboard/stats-math";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToday } from "@/hooks/use-today";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DailyBarsProps {
	/** Zero-filled daily series for the selected period (ascending). */
	daily: DailyBar[];
	/** Period total minutes, shown in the header. */
	total: number;
	/** Localized period label (e.g. "This month"). */
	periodLabel: string;
	/** Tailwind bg utility for the bars; defaults to the workspace accent. */
	barClassName?: string;
	className?: string;
}

/**
 * Per-day CSS bar chart (no chart library) for the selected period. Adds an
 * average reference line, dimmed weekends, and a hover focus state so the chart
 * says something about *when* and *how steadily* work happens. The window is
 * driven by the external period selector — this just renders what it is given.
 */
export function DailyBars({
	daily,
	total,
	periodLabel,
	barClassName = "bg-brand",
	className,
}: DailyBarsProps) {
	const { t, i18n } = useTranslation();
	const today = useToday();
	const [hover, setHover] = useState<number | null>(null);

	const max = Math.max(1, ...daily.map((day) => day.minutes));
	// Average over working days (days with logged time), not the whole window —
	// idle/future days shouldn't drag the "typical day" line down.
	const workingDays = daily.filter((day) => day.minutes > 0);
	const avg = Math.round(
		workingDays.reduce((sum, day) => sum + day.minutes, 0) /
			Math.max(1, workingDays.length),
	);

	return (
		<Card className={cn("[--card-spacing:--spacing(5)]", className)}>
			<CardHeader className="flex items-center justify-between pb-2">
				<div className="flex items-baseline gap-2">
					<CardTitle className="text-sm font-semibold">
						{t("dashboard.dailyFocus")}
					</CardTitle>
					<span className="text-muted-foreground text-xs">{periodLabel}</span>
				</div>
				<span className="text-muted-foreground text-sm tabular-nums">
					{formatDuration(total)}
				</span>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col">
				<div className="relative flex flex-1 flex-col">
					<div className="flex min-h-[104px] flex-1 items-end gap-[3px]">
						{daily.map((day, i) => (
							<Tooltip key={day.date}>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label={`${formatDay(day.date, i18n.language, { now: today })} · ${formatDuration(day.minutes)}`}
										className="flex h-full flex-1 flex-col justify-end"
										onMouseEnter={() => setHover(i)}
										onMouseLeave={() => setHover(null)}
										onFocus={() => setHover(i)}
										onBlur={() => setHover(null)}
									>
										<div
											className={cn(
												"w-full rounded-[3px] transition-all",
												barClassName,
												day.minutes === 0 && "bg-border",
											)}
											style={
												day.minutes > 0
													? {
															height: `${(day.minutes / max) * 100}%`,
															minHeight: 3,
															opacity:
																hover === null
																	? day.isWeekend
																		? 0.45
																		: 1
																	: hover === i
																		? 1
																		: 0.3,
														}
													: { height: 2 }
											}
										/>
									</button>
								</TooltipTrigger>
								<TooltipContent>
									{formatDay(day.date, i18n.language, { now: today })} ·{" "}
									{formatDuration(day.minutes)}
								</TooltipContent>
							</Tooltip>
						))}
					</div>
					{avg > 0 && (
						<div
							className="border-foreground/30 pointer-events-none absolute inset-x-0 border-t border-dashed"
							style={{ bottom: `${(avg / max) * 100}%` }}
						>
							<span className="bg-card text-muted-foreground absolute -top-2 right-0 px-1 text-[10px]">
								{t("dashboard.avgLabel", { value: formatDuration(avg) })}
							</span>
						</div>
					)}
				</div>
				<div className="mt-1.5 flex gap-[3px]">
					{daily.map((day) => {
						const dayNum = Number(day.date.slice(8));
						// Label odd days only, matching the mockup's spacing.
						return (
							<div
								key={day.date}
								className="text-muted-foreground flex-1 text-center text-[10px] tabular-nums"
							>
								{dayNum % 2 === 1 ? dayNum : ""}
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
