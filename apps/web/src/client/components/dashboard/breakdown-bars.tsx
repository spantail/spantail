import { formatDuration } from "@toxil/core";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BreakdownBarsProps {
	title: string;
	/** Optional subtitle shown to the right of the title (e.g. month total). */
	subtitle?: string;
	/** Descending by minutes; rendered as a share-of-total ranking. */
	items: Array<{ key: string; label: string; minutes: number }>;
	className?: string;
}

/**
 * Share-of-total ranking. Each row shows its percentage of the period total and
 * a bar scaled to the leader; the monochrome fill fades down the ranking so the
 * ordering reads at a glance without colour.
 */
export function BreakdownBars({
	title,
	subtitle,
	items,
	className,
}: BreakdownBarsProps) {
	const { t } = useTranslation();
	const total = items.reduce((sum, item) => sum + item.minutes, 0);
	const max = Math.max(1, ...items.map((item) => item.minutes));

	return (
		<Card className={cn("[--card-spacing:--spacing(5)]", className)}>
			<CardHeader className="flex items-center justify-between pb-2">
				<CardTitle className="text-sm font-semibold">{title}</CardTitle>
				{subtitle && (
					<span className="text-muted-foreground text-xs tabular-nums">
						{subtitle}
					</span>
				)}
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("dashboard.noData")}
					</p>
				) : (
					<ul className="flex flex-col gap-3">
						{items.map((item, i) => {
							const pct =
								total > 0 ? Math.round((item.minutes / total) * 100) : 0;
							return (
								<li key={item.key} className="flex flex-col gap-1">
									<div className="flex items-baseline justify-between text-sm">
										<span className="truncate font-medium" title={item.label}>
											{item.label}
										</span>
										<div className="flex items-baseline gap-2 tabular-nums">
											<span className="text-muted-foreground">{pct}%</span>
											<span className="w-14 text-right whitespace-nowrap">
												{formatDuration(item.minutes)}
											</span>
										</div>
									</div>
									<div className="bg-muted h-2 overflow-hidden rounded-full">
										<div
											className="bg-foreground h-full rounded-full transition-all"
											style={{
												width: `${(item.minutes / max) * 100}%`,
												opacity: Math.max(0.3, 1 - i * 0.13),
											}}
										/>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
