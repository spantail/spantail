import { formatDuration } from "@toxil/core";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BreakdownBarsProps {
	title: string;
	items: Array<{ key: string; label: string; minutes: number }>;
}

/** Horizontal share-of-total bars (this-month breakdown). */
export function BreakdownBars({ title, items }: BreakdownBarsProps) {
	const { t } = useTranslation();
	const max = Math.max(1, ...items.map((item) => item.minutes));

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-muted-foreground text-sm font-medium">
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("dashboard.noData")}
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{items.map((item) => (
							<li key={item.key} className="flex items-center gap-2 text-sm">
								<span className="w-32 truncate" title={item.label}>
									{item.label}
								</span>
								<div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
									<div
										className="bg-primary h-full rounded-full"
										style={{ width: `${(item.minutes / max) * 100}%` }}
									/>
								</div>
								<span className="text-muted-foreground w-16 text-right whitespace-nowrap tabular-nums">
									{formatDuration(item.minutes)}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
