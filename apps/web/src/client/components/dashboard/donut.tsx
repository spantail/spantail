import { formatDuration, formatHours } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface DonutItem {
	key: string;
	label: string;
	minutes: number;
	/** Project/member hue; null falls back to a neutral grey slice. */
	hue: number | null;
}

interface DonutProps {
	title: string;
	/** Localized period label, shown in the header and the ring center. */
	periodLabel: string;
	/** Descending by minutes; rendered as ring segments + a legend. */
	items: DonutItem[];
	total: number;
	className?: string;
}

const SIZE = 168;
const STROKE = 22;

/** Matches the colored dots used elsewhere (`components/dot.tsx`). */
function sliceColor(hue: number | null): string {
	return hue == null ? "var(--muted-foreground)" : `oklch(0.62 0.17 ${hue})`;
}

/**
 * Share-of-total donut (hand-built SVG, no chart library). The ring center
 * shows the period total in decimal hours — or the hovered slice — and a legend
 * lists each item's share. The SVG is decorative; the legend carries the text.
 */
export function Donut({
	title,
	periodLabel,
	items,
	total,
	className,
}: DonutProps) {
	const { t } = useTranslation();
	const [hover, setHover] = useState<number | null>(null);
	const radius = (SIZE - STROKE) / 2;
	const circumference = 2 * Math.PI * radius;

	const hovered = hover != null ? items[hover] : null;
	const centerMinutes = hovered ? hovered.minutes : total;
	const centerLabel = hovered ? hovered.label : periodLabel;

	let offset = 0;

	return (
		<Card className={cn("[--card-spacing:--spacing(5)]", className)}>
			<CardHeader className="flex items-center justify-between pb-2">
				<CardTitle className="text-sm font-semibold">{title}</CardTitle>
				<span className="text-muted-foreground text-xs tabular-nums">
					{formatDuration(total)} · {periodLabel}
				</span>
			</CardHeader>
			<CardContent>
				{items.length === 0 || total === 0 ? (
					// Keep the populated-donut height so the stacked home row (and the
					// height-matched inbox beside it) doesn't collapse on an empty period.
					<div
						className="text-muted-foreground flex items-center text-sm"
						style={{ minHeight: SIZE }}
					>
						{t("dashboard.noData")}
					</div>
				) : (
					<div className="flex items-center gap-5">
						<div
							className="relative shrink-0"
							style={{ width: SIZE, height: SIZE }}
						>
							<svg
								width={SIZE}
								height={SIZE}
								viewBox={`0 0 ${SIZE} ${SIZE}`}
								style={{ transform: "rotate(-90deg)" }}
								role="img"
								aria-label={title}
							>
								<circle
									cx={SIZE / 2}
									cy={SIZE / 2}
									r={radius}
									fill="none"
									stroke="var(--muted)"
									strokeWidth={STROKE}
								/>
								{items.map((item, i) => {
									const fraction = item.minutes / total;
									const dash = fraction * circumference;
									const circle = (
										// biome-ignore lint/a11y/noStaticElementInteractions: decorative slice highlight; the legend carries the data
										<circle
											key={item.key}
											cx={SIZE / 2}
											cy={SIZE / 2}
											r={radius}
											fill="none"
											stroke={sliceColor(item.hue)}
											strokeWidth={hover === i ? STROKE + 3 : STROKE}
											strokeDasharray={`${dash} ${circumference - dash}`}
											strokeDashoffset={-offset * circumference}
											opacity={hover === null || hover === i ? 1 : 0.4}
											style={{ transition: "stroke-width .15s, opacity .15s" }}
											onMouseEnter={() => setHover(i)}
											onMouseLeave={() => setHover(null)}
										/>
									);
									offset += fraction;
									return circle;
								})}
							</svg>
							<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
								<span className="font-heading text-2xl font-semibold tabular-nums">
									{formatHours(centerMinutes)}
								</span>
								<span className="text-muted-foreground truncate px-3 text-xs">
									{centerLabel}
								</span>
							</div>
						</div>
						<ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
							{items.map((item, i) => (
								<li
									key={item.key}
									className="flex items-center gap-2 rounded px-1 py-0.5 transition-colors"
									style={
										hover === i ? { background: "var(--muted)" } : undefined
									}
									onMouseEnter={() => setHover(i)}
									onMouseLeave={() => setHover(null)}
								>
									<span
										className="size-2.5 shrink-0 rounded-full"
										style={{ background: sliceColor(item.hue) }}
									/>
									<span className="flex-1 truncate" title={item.label}>
										{item.label}
									</span>
									<span className="text-muted-foreground tabular-nums">
										{Math.round((item.minutes / total) * 100)}%
									</span>
								</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
