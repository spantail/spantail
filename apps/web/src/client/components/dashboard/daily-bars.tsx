import { formatDuration } from "@toxil/core";
import { useTranslation } from "react-i18next";

import type { StatBucket } from "@/components/dashboard/stat-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatEntryDate } from "@/lib/format";

interface DailyBarsProps {
	daily: Array<{ date: string } & StatBucket>;
}

/** Per-day CSS bar chart of the recent window (no chart library). */
export function DailyBars({ daily }: DailyBarsProps) {
	const { t, i18n } = useTranslation();
	const max = Math.max(1, ...daily.map((day) => day.minutes));

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-muted-foreground text-sm font-medium">
					{t("dashboard.last14Days")}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex h-28 items-end gap-1">
					{daily.map((day) => (
						<Tooltip key={day.date}>
							<TooltipTrigger asChild>
								<div className="flex h-full flex-1 flex-col justify-end gap-1">
									<div
										className={
											day.minutes > 0
												? "bg-primary min-h-1 rounded-sm"
												: "bg-muted h-px rounded-sm"
										}
										style={
											day.minutes > 0
												? { height: `${(day.minutes / max) * 100}%` }
												: undefined
										}
									/>
									<span className="text-muted-foreground text-center text-[10px] tabular-nums">
										{Number(day.date.slice(8))}
									</span>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								{formatEntryDate(day.date, i18n.language)} ·{" "}
								{formatDuration(day.minutes)}
							</TooltipContent>
						</Tooltip>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
