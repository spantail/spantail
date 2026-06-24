import type { Project, WorkSpan } from "@spantail/core";
import { formatDuration } from "@spantail/core";
import { SquarePenIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Dot } from "@/components/dot";
import { SpanActions } from "@/components/span-actions";
import { useSpanDialog } from "@/components/span-dialog";
import { Badge } from "@/components/ui/badge";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { formatSpanDate } from "@/lib/format";

export interface TimelineDay {
	date: string;
	totalMinutes: number;
	spans: WorkSpan[];
}

/** Groups spans by span date, preserving the given (date-desc) order. */
export function groupSpansByDate(spans: WorkSpan[]): TimelineDay[] {
	const days = new Map<string, TimelineDay>();
	for (const span of spans) {
		let day = days.get(span.spanDate);
		if (!day) {
			day = { date: span.spanDate, totalMinutes: 0, spans: [] };
			days.set(span.spanDate, day);
		}
		day.spans.push(span);
		day.totalMinutes += span.durationMinutes;
	}
	return [...days.values()];
}

interface SpanTimelineProps {
	spans: WorkSpan[];
	projects: Project[];
	/** Loads the next page when keyboard nav reaches the last span. */
	onLoadMore?: () => void;
	/** Starts a daily report for the day (header pen button); hidden when absent. */
	onCreateReport?: (day: TimelineDay) => void;
}

/**
 * The personal work log as a vertical timeline: each day is a band with a
 * continuous rail and project-tinted span nodes carrying the description,
 * project, tags, and duration.
 */
export function SpanTimeline({
	spans,
	projects,
	onLoadMore,
	onCreateReport,
}: SpanTimelineProps) {
	const { t, i18n } = useTranslation();
	const { openView } = useSpanDialog();
	const projectById = useMemo(
		() => new Map(projects.map((p) => [p.id, p])),
		[projects],
	);
	const currentYear = String(new Date().getFullYear());

	// Keyboard nav over the flat (cross-day) order; the highlight maps back to a
	// row via its span id. Derive the grouping and the id→index map once per
	// span list so rapid j/k key repeats only update highlight/scroll.
	const days = useMemo(() => groupSpansByDate(spans), [spans]);
	const indexById = useMemo(
		() => new Map(spans.map((span, i) => [span.id, i])),
		[spans],
	);
	const containerRef = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState(-1);
	useListKeyboardNav({
		length: spans.length,
		index: active,
		onMove: setActive,
		onOpen: () => {
			const span = spans[active];
			if (span) openView(span);
		},
		onReachEnd: onLoadMore,
		containerRef,
	});

	return (
		<div ref={containerRef} className="flex flex-col gap-7">
			{days.map((day) => {
				const dayLabel = formatSpanDate(day.date, i18n.language, {
					weekday: "long",
					month: "short",
					day: "numeric",
					...(day.date.startsWith(currentYear) ? {} : { year: "numeric" }),
				});
				return (
					<section key={day.date} className="flex flex-col gap-4">
						<div className="flex items-center justify-between gap-3">
							<h3 className="font-heading text-sm font-semibold tracking-tight">
								{dayLabel}
							</h3>
							{onCreateReport ? (
								<button
									type="button"
									onClick={() => onCreateReport(day)}
									title={t("timeline.createReport", { date: dayLabel })}
									aria-label={t("timeline.createReport", { date: dayLabel })}
									className="border-border/70 text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-md border px-2 py-1 transition-colors"
								>
									<span className="text-xs tabular-nums">
										{formatDuration(day.totalMinutes)}
									</span>
									<span className="bg-border h-3 w-px" />
									<SquarePenIcon className="size-3.5" />
								</button>
							) : (
								<span className="text-muted-foreground text-sm tabular-nums">
									{formatDuration(day.totalMinutes)}
								</span>
							)}
						</div>
						<div className="relative">
							{/* continuous rail behind the nodes */}
							<span className="bg-border pointer-events-none absolute top-2 bottom-2 left-[5px] w-px" />
							<ul className="flex flex-col gap-4">
								{day.spans.map((span) => {
									const idx = indexById.get(span.id);
									const project = span.projectId
										? projectById.get(span.projectId)
										: undefined;
									const projectLabel = span.projectId
										? (project?.name ?? span.projectId)
										: t("projects.unassigned");
									return (
										// The row body is a button (opens the detail dialog); the rail
										// node and actions menu are siblings so buttons never nest.
										<li
											key={span.id}
											data-nav-index={idx}
											data-nav-active={
												active >= 0 && active === idx ? "" : undefined
											}
											className="group relative flex items-start gap-3"
										>
											<span className="relative z-10 mt-[3px] flex w-3 shrink-0 justify-center">
												{project ? (
													<Dot
														hue={project.hue}
														size={12}
														className="ring-background ring-4 transition-transform group-hover:scale-110"
													/>
												) : (
													<span className="bg-muted-foreground/40 ring-background size-3 rounded-full ring-4 transition-transform group-hover:scale-110" />
												)}
											</span>
											<button
												type="button"
												onClick={() => openView(span)}
												className="group-data-[nav-active]:bg-muted hover:bg-muted/50 -my-1 min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors"
											>
												<span className="flex items-start justify-between gap-3">
													<span className="decoration-foreground/20 text-sm leading-snug underline-offset-4 group-hover:underline">
														{span.description}
													</span>
													<span className="text-muted-foreground shrink-0 pt-px text-sm whitespace-nowrap tabular-nums">
														{formatDuration(span.durationMinutes)}
													</span>
												</span>
												<span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
													<span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
														{project ? (
															<Dot hue={project.hue} size={6} />
														) : (
															<span className="bg-muted-foreground/40 size-1.5 rounded-full" />
														)}
														{projectLabel}
													</span>
													{span.tags.map((tag) => (
														<Badge key={tag} variant="secondary">
															{tag}
														</Badge>
													))}
												</span>
											</button>
											<SpanActions span={span} />
										</li>
									);
								})}
							</ul>
						</div>
					</section>
				);
			})}
		</div>
	);
}
