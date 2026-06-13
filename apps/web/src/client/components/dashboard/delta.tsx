import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface DeltaProps {
	/** Percentage change vs. the comparison period (e.g. 12 or -8). */
	value: number;
	className?: string;
}

/**
 * Period-over-period change. Monochrome by design: direction is shown by the
 * arrow, not colour — the whole app is intentionally greyscale.
 */
export function Delta({ value, className }: DeltaProps) {
	const Arrow = value >= 0 ? ArrowUpIcon : ArrowDownIcon;
	return (
		<span
			className={cn(
				"bg-muted text-muted-foreground inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
				className,
			)}
		>
			<Arrow className="size-3" aria-hidden="true" />
			{Math.abs(value)}%
		</span>
	);
}
