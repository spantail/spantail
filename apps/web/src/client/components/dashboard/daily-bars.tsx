import { formatDuration } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { DailyBar } from "@/components/dashboard/stats-math";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatEntryDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DailyBarsProps {
	/** Ascending daily series; the longest window the toggle can show. */
	daily: DailyBar[];
	className?: string;
}

type Range = "14" | "28";

/**
 * Per-day CSS bar chart (no chart library). Adds an average reference line,
 * dimmed weekends, a hover focus state, and a 14d/28d window toggle so the
 * chart actually says something about *when* and *how steadily* work happens.
 */
export function DailyBars({ daily, className }: DailyBarsProps) {
	const { t, i18n } = useTranslation();
	const [range, setRange] = useState<Range>("14");
	const [hover, setHover] = useState<number | null>(null);

	const days = range === "28" ? daily : daily.slice(-14);
	const max = Math.max(1, ...days.map((day) => day.minutes));
	const avg = Math.round(
		days.reduce((sum, day) => sum + day.minutes, 0) / Math.max(1, days.length),
	);
	const labelStep = days.length > 20 ? 4 : 2;

	return (
		<Card className={cn("[--card-spacing:--spacing(5)]", className)}>
			<CardHeader className="flex items-start justify-between gap-2 pb-2">
				<div>
					<CardTitle className="text-sm font-semibold">
						{t("dashboard.activity")}
					</CardTitle>
					<p className="text-muted-foreground text-xs">
						{t("dashboard.dailyFocusAvg", { avg: formatDuration(avg) })}
					</p>
				</div>
				<div className="bg-muted/50 inline-flex items-center gap-1 rounded-lg border p-1 text-sm">
					{(["14", "28"] as const).map((value) => (
						<button
							key={value}
							type="button"
							onClick={() => setRange(value)}
							className={cn(
								"rounded-md px-3 py-1 font-medium transition-colors",
								range === value
									? "bg-card text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{t(value === "14" ? "dashboard.range14" : "dashboard.range28")}
						</button>
					))}
				</div>
			</CardHeader>
			<CardContent>
				<div className="relative">
					<div className="flex h-32 items-end gap-[3px]">
						{days.map((day, i) => (
							<Tooltip key={day.date}>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label={`${formatEntryDate(day.date, i18n.language)} · ${formatDuration(day.minutes)}`}
										className="flex h-full flex-1 flex-col justify-end"
										onMouseEnter={() => setHover(i)}
										onMouseLeave={() => setHover(null)}
										onFocus={() => setHover(i)}
										onBlur={() => setHover(null)}
									>
										<div
											className={cn(
												"bg-foreground w-full rounded-[3px] transition-all",
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
									{formatEntryDate(day.date, i18n.language)} ·{" "}
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
					{days.map((day, i) => (
						<div
							key={day.date}
							className="text-muted-foreground flex-1 text-center text-[10px] tabular-nums"
						>
							{i % labelStep === 0 ? Number(day.date.slice(8)) : ""}
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
