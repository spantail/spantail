import { formatDuration } from "@toxil/core";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface StatBucket {
	minutes: number;
	count: number;
}

interface StatCardsProps {
	today: StatBucket;
	thisWeek: StatBucket;
	thisMonth: StatBucket;
}

export function StatCards({ today, thisWeek, thisMonth }: StatCardsProps) {
	const { t } = useTranslation();
	const cards = [
		{ key: "dashboard.today", bucket: today },
		{ key: "dashboard.thisWeek", bucket: thisWeek },
		{ key: "dashboard.thisMonth", bucket: thisMonth },
	];

	return (
		<div className="grid gap-4 sm:grid-cols-3">
			{cards.map(({ key, bucket }) => (
				<Card key={key}>
					<CardHeader className="pb-2">
						<CardTitle className="text-muted-foreground text-sm font-medium">
							{t(key)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="font-heading text-2xl font-semibold tabular-nums">
							{formatDuration(bucket.minutes)}
						</p>
						<p className="text-muted-foreground text-sm">
							{t("dashboard.entryCount", { count: bucket.count })}
						</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
