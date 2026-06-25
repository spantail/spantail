import { cn } from "@/lib/utils";

interface Point {
	x: number;
	y: number;
}

/** Catmull-Rom-ish smooth path through the points (matches the dashboard mockup). */
function smoothPath(points: Point[]): string {
	if (points.length < 2) return "";
	let d = `M ${points[0]?.x} ${points[0]?.y}`;
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i - 1] ?? points[i];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[i + 2] ?? p2;
		if (!p0 || !p1 || !p2 || !p3) continue;
		const c1x = p1.x + (p2.x - p0.x) / 6;
		const c1y = p1.y + (p2.y - p0.y) / 6;
		const c2x = p2.x - (p3.x - p1.x) / 6;
		const c2y = p2.y - (p3.y - p1.y) / 6;
		d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
	}
	return d;
}

interface SparklineProps {
	/** Series to plot, oldest → newest. */
	values: number[];
	/** Fill the area under the line (faint), in addition to the stroke. */
	area?: boolean;
	height?: number;
	className?: string;
}

/**
 * Tiny inline SVG trend line — no axes, no library. Draws in `currentColor`, so
 * the parent sets the hue (e.g. `text-brand`). Stretches to its container width.
 */
export function Sparkline({
	values,
	area = false,
	height = 28,
	className,
}: SparklineProps) {
	const width = 100;
	// A single (or empty) point has no trend to draw; render nothing so the slot
	// just collapses rather than throwing on a divide-by-zero.
	if (values.length < 2) return null;
	const max = Math.max(1, ...values);
	const points = values.map((v, i) => ({
		x: (i / (values.length - 1)) * width,
		y: height - 2 - (v / max) * (height - 4),
	}));
	const line = smoothPath(points);
	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			aria-hidden="true"
			className={cn("w-full", className)}
			style={{ height }}
		>
			{area && (
				<path
					d={`${line} L ${width} ${height} L 0 ${height} Z`}
					fill="currentColor"
					opacity={0.12}
				/>
			)}
			<path
				d={line}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}
