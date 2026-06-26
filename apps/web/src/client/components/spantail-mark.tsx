import { useId } from "react";

import { cn } from "@/lib/utils";

// The Spantail brand mark: a stack of rounded "span" bars trailing into a dot —
// span + tail. Coordinates are on a 340×340 canvas; callers scale via `size`.
const BARS = [
	{ x: 50, y: 63, w: 124, from: "#8fe3c4", to: "#6fd0d8", opacity: 0.45 },
	{ x: 74, y: 109, w: 168, from: "#6fd0d8", to: "#56c6d8", opacity: 0.62 },
	{ x: 102, y: 155, w: 114, from: "#4a9eff", to: "#54c6d8", opacity: 0.78 },
	{ x: 66, y: 201, w: 180, from: "#54c6d8", to: "#8fe3c4", opacity: 0.9 },
	{ x: 116, y: 247, w: 150, from: "#4a9eff", to: "#8fe3c4", opacity: 1 },
];

// The bars + dot occupy only the middle of the 340×340 canvas; this viewBox is
// cropped to their bounding box (+ small padding) so the mark fills its box
// instead of floating in whitespace. `size` is the rendered width; height keeps
// the cropped aspect ratio.
const VIEW_BOX = "42 55 263 230";
const ASPECT = 230 / 263;

export function SpantailMark({
	size = 120,
	className,
}: {
	size?: number;
	className?: string;
}) {
	// Gradient ids must be unique per instance: two marks on the same page would
	// otherwise share ids. Strip non-alphanumerics from useId() (it can contain
	// ":" etc.) so the value is safe inside SVG `url(#…)` references.
	const uid = useId().replace(/[^a-z0-9]/gi, "");
	return (
		<svg
			width={size}
			height={size * ASPECT}
			viewBox={VIEW_BOX}
			fill="none"
			aria-hidden="true"
			className={cn(className)}
		>
			<defs>
				{BARS.map((bar, i) => (
					<linearGradient
						key={bar.y}
						id={`${uid}-${i}`}
						x1="0"
						y1="0"
						x2="1"
						y2="0"
					>
						<stop offset="0%" stopColor={bar.from} />
						<stop offset="100%" stopColor={bar.to} />
					</linearGradient>
				))}
			</defs>
			{BARS.map((bar, i) => (
				<rect
					key={bar.y}
					x={bar.x}
					y={bar.y}
					width={bar.w}
					height={30}
					rx={15}
					fill={`url(#${uid}-${i})`}
					opacity={bar.opacity}
				/>
			))}
			<circle cx={287} cy={262} r={10} fill="#9af7ff" />
		</svg>
	);
}
