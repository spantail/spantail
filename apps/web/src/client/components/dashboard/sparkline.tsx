interface SparklineProps {
	/** Series to plot; rendered left-to-right. */
	values: number[];
	/** Fill the area under the line (uses currentColor at low opacity). */
	area?: boolean;
	/** Drawing height in px; the SVG stretches to its container width. */
	height?: number;
	className?: string;
}

/** Catmull-Rom-ish smoothing through the points for a soft curve. */
function smoothPath(points: Array<{ x: number; y: number }>): string {
	const first = points[0];
	if (points.length < 2 || !first) return "";
	let d = `M ${first.x} ${first.y}`;
	for (let i = 0; i < points.length - 1; i++) {
		const p1 = points[i];
		const p2 = points[i + 1];
		if (!p1 || !p2) continue;
		const p0 = points[i - 1] ?? p1;
		const p3 = points[i + 2] ?? p2;
		const c1x = p1.x + (p2.x - p0.x) / 6;
		const c1y = p1.y + (p2.y - p0.y) / 6;
		const c2x = p2.x - (p3.x - p1.x) / 6;
		const c2y = p2.y - (p3.y - p1.y) / 6;
		d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
	}
	return d;
}

/**
 * Tiny inline trend chart (no axes, no library). Inherits `currentColor`, so
 * callers set the tone with a text color class.
 */
export function Sparkline({
	values,
	area = false,
	height = 32,
	className,
}: SparklineProps) {
	const width = 100;
	const max = Math.max(1, ...values);
	const points = values.map((value, i) => ({
		x: values.length > 1 ? (i / (values.length - 1)) * width : 0,
		y: height - 2 - (value / max) * (height - 4),
	}));
	const line = smoothPath(points);

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			className={className}
			style={{ width: "100%", height }}
			aria-hidden="true"
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
