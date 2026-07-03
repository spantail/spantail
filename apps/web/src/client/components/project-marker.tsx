import type { ProjectSymbol } from "@spantail/core";
import type { ReactNode } from "react";

import { projectColor } from "@/lib/hue";
import { cn } from "@/lib/utils";

/** Filled geometric glyphs (viewBox 0 0 24 24, currentColor) that pair with a
 *  project's hue so a project is identifiable by shape as well as colour — the
 *  colour is never the sole cue (WCAG 1.4.1). Original primitives, unencumbered. */
const MARKS: Record<ProjectSymbol, ReactNode> = {
	circle: <circle cx={12} cy={12} r={6.5} />,
	square: <rect x={6} y={6} width={12} height={12} rx={2.5} />,
	triangle: <polygon points="12,5 19.5,18 4.5,18" />,
	diamond: <polygon points="12,4 20,12 12,20 4,12" />,
	star: (
		<polygon points="12,3.5 14.35,9.1 20.5,9.6 15.8,13.65 17.25,19.6 12,16.35 6.75,19.6 8.2,13.65 3.5,9.6 9.65,9.1" />
	),
	heart: (
		<path d="M12 20.5l-1.35-1.2C5.9 15 3 12.4 3 9.15 3 6.5 5.05 4.5 7.65 4.5c1.47 0 2.88.68 3.8 1.76l.55.64.55-.64A5.02 5.02 0 0 1 16.35 4.5C18.95 4.5 21 6.5 21 9.15c0 3.25-2.9 5.85-7.65 10.16L12 20.5z" />
	),
	spade: (
		<path d="M12 3C9.4 6.4 4.5 9.2 4.5 13.2c0 2.4 1.8 3.6 3.6 3.6 1.05 0 2-.4 2.65-1.05-.1 1.9-1 3.35-2.6 4.05h7.7c-1.6-.7-2.5-2.15-2.6-4.05.65.65 1.6 1.05 2.65 1.05 1.8 0 3.6-1.2 3.6-3.6C19.5 9.2 14.6 6.4 12 3z" />
	),
	club: (
		<>
			<circle cx={12} cy={7.5} r={3.3} />
			<circle cx={7.7} cy={13} r={3.3} />
			<circle cx={16.3} cy={13} r={3.3} />
			<polygon points="10.3,13 13.7,13 15,20.5 9,20.5" />
		</>
	),
	ring: (
		<path
			fillRule="evenodd"
			d="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z"
		/>
	),
};

/** A project's identity marker: the project's symbol glyph filled in its colour.
 *  Decorative — the project name is always adjacent — so hidden from a11y. */
export function ProjectMarker({
	hue,
	symbol,
	size = 12,
	className,
}: {
	hue: number;
	symbol: ProjectSymbol;
	size?: number;
	className?: string;
}) {
	return (
		// biome-ignore lint/a11y/noSvgWithoutTitle: decorative marker; the project name is always adjacent
		<svg
			aria-hidden
			focusable="false"
			className={cn("shrink-0", className)}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			style={{ color: projectColor(hue) }}
		>
			{MARKS[symbol] ?? MARKS.circle}
		</svg>
	);
}
