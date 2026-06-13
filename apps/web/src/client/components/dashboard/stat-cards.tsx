import { Delta } from "@/components/dashboard/delta";
import { Sparkline } from "@/components/dashboard/sparkline";
import { Card } from "@/components/ui/card";

export interface StatBucket {
	minutes: number;
	count: number;
}

export interface StatCardData {
	key: string;
	label: string;
	/** Pre-formatted primary value, e.g. "2h 05m". */
	value: string;
	/** Secondary line under the value (entry count, comparison, …). */
	sub: string;
	/** Percentage change vs. the comparison period; omit/null to hide. */
	delta?: number | null;
	/** Trailing-window series for the inline sparkline. */
	spark?: number[];
}

/** Single metric tile: label + delta, big value, subtitle, and a sparkline. */
function StatCard({
	label,
	value,
	sub,
	delta,
	spark,
}: Omit<StatCardData, "key">) {
	return (
		<Card className="hover:ring-foreground/20 gap-0 transition-[box-shadow]">
			<div className="flex items-center justify-between px-(--card-spacing)">
				<span className="text-muted-foreground text-sm font-medium">
					{label}
				</span>
				{delta != null && <Delta value={delta} />}
			</div>
			<div className="mt-1.5 flex items-end justify-between gap-2 px-(--card-spacing)">
				<div className="min-w-0">
					<p className="font-heading text-2xl font-semibold tabular-nums">
						{value}
					</p>
					<p className="text-muted-foreground mt-0.5 truncate text-sm">{sub}</p>
				</div>
				{spark && spark.length > 1 && (
					<div className="text-foreground/60 h-8 w-24 shrink-0">
						<Sparkline values={spark} area height={32} />
					</div>
				)}
			</div>
		</Card>
	);
}

export function StatCards({ cards }: { cards: StatCardData[] }) {
	return (
		<div className="grid gap-4 sm:grid-cols-3">
			{cards.map(({ key, ...card }) => (
				<StatCard key={key} {...card} />
			))}
		</div>
	);
}
