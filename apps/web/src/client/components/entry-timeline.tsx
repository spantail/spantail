import type { Project, WorkEntry } from "@spantail/core";
import { formatDuration } from "@spantail/core";
import { SquarePenIcon } from "lucide-react";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EntryActions } from "@/components/entry-actions";
import { useEntryDialog } from "@/components/entry-dialog";
import { ProjectMarker } from "@/components/project-marker";
import { Badge } from "@/components/ui/badge";
import { useEntryRowNav } from "@/hooks/use-entry-row-nav";
import { formatEntryDate } from "@/lib/format";

export interface TimelineDay {
	date: string;
	totalMinutes: number;
	entries: WorkEntry[];
}

/** Groups entries by entry date, preserving the given (date-desc) order. */
export function groupEntriesByDate(entries: WorkEntry[]): TimelineDay[] {
	const days = new Map<string, TimelineDay>();
	for (const entry of entries) {
		let day = days.get(entry.entryDate);
		if (!day) {
			day = { date: entry.entryDate, totalMinutes: 0, entries: [] };
			days.set(entry.entryDate, day);
		}
		day.entries.push(entry);
		day.totalMinutes += entry.durationMinutes;
	}
	return [...days.values()];
}

interface EntryTimelineProps {
	entries: WorkEntry[];
	projects: Project[];
	/** Loads the next page when keyboard nav reaches the last entry. */
	onLoadMore?: () => void;
	/** Starts a daily report for the day (header pen button); hidden when absent. */
	onCreateReport?: (day: TimelineDay) => void;
}

/**
 * The personal work log as a vertical timeline: each day is a band with a
 * continuous rail and project-tinted entry nodes carrying the description,
 * project, tags, and duration.
 */
export function EntryTimeline({
	entries,
	projects,
	onLoadMore,
	onCreateReport,
}: EntryTimelineProps) {
	const { t, i18n } = useTranslation();
	const { openView } = useEntryDialog();
	const projectById = useMemo(
		() => new Map(projects.map((p) => [p.id, p])),
		[projects],
	);
	const currentYear = String(new Date().getFullYear());

	// Keyboard nav over the flat (cross-day) order; the highlight maps back to a
	// row via its entry id. Derive the grouping and the id→index map once per
	// entry list so rapid j/k key repeats only update highlight/scroll.
	const days = useMemo(() => groupEntriesByDate(entries), [entries]);
	const indexById = useMemo(
		() => new Map(entries.map((entry, i) => [entry.id, i])),
		[entries],
	);
	const containerRef = useRef<HTMLDivElement>(null);
	const { activeIndex } = useEntryRowNav(entries, containerRef, onLoadMore);

	return (
		<div ref={containerRef} className="flex flex-col gap-7">
			{days.map((day) => {
				const dayLabel = formatEntryDate(day.date, i18n.language, {
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
								{day.entries.map((entry) => {
									const idx = indexById.get(entry.id);
									const project = entry.projectId
										? projectById.get(entry.projectId)
										: undefined;
									const projectLabel = entry.projectId
										? (project?.name ?? entry.projectId)
										: t("projects.unassigned");
									return (
										// The row body is a button (opens the detail dialog); the rail
										// node and actions menu are siblings so buttons never nest.
										<li
											key={entry.id}
											data-nav-index={idx}
											data-nav-active={
												activeIndex >= 0 && activeIndex === idx ? "" : undefined
											}
											className="group relative flex items-start gap-3"
										>
											<span className="relative z-10 mt-[3px] flex w-3 shrink-0 justify-center">
												{project ? (
													<span className="bg-background ring-background flex size-4 items-center justify-center rounded-full ring-4 transition-transform group-hover:scale-110">
														<ProjectMarker
															hue={project.hue}
															symbol={project.symbol}
															size={16}
														/>
													</span>
												) : (
													<span className="bg-muted-foreground/40 ring-background size-4 rounded-full ring-4 transition-transform group-hover:scale-110" />
												)}
											</span>
											<button
												type="button"
												onClick={() => openView(entry)}
												className="group-data-[nav-active]:bg-muted hover:bg-muted/50 -my-1 min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors"
											>
												<span className="flex items-start justify-between gap-3">
													<span className="decoration-foreground/20 text-sm leading-snug underline-offset-4 group-hover:underline">
														{entry.description}
													</span>
													<span className="text-muted-foreground shrink-0 pt-px text-sm whitespace-nowrap tabular-nums">
														{formatDuration(entry.durationMinutes)}
													</span>
												</span>
												<span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
													<span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
														{project ? (
															<ProjectMarker
																hue={project.hue}
																symbol={project.symbol}
																size={12}
															/>
														) : (
															<span className="bg-muted-foreground/40 size-1.5 rounded-full" />
														)}
														{projectLabel}
													</span>
													{entry.tags.map((tag) => (
														<Badge key={tag} variant="secondary">
															{tag}
														</Badge>
													))}
												</span>
											</button>
											<EntryActions entry={entry} />
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
