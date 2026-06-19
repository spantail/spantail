import type { Project, WorkEntry } from "@toxil/core";
import { formatDuration } from "@toxil/core";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { EntryActions } from "@/components/entry-actions";
import { useEntryDialog } from "@/components/entry-dialog";
import { Badge } from "@/components/ui/badge";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
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
}

/** The personal work log: entries grouped under date headers. */
export function EntryTimeline({
	entries,
	projects,
	onLoadMore,
}: EntryTimelineProps) {
	const { t, i18n } = useTranslation();
	const { openView } = useEntryDialog();
	const projectName = (id: string | null) =>
		id
			? (projects.find((p) => p.id === id)?.name ?? id)
			: t("projects.unassigned");
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
	const [active, setActive] = useState(-1);
	useListKeyboardNav({
		length: entries.length,
		index: active,
		onMove: setActive,
		onOpen: () => {
			const entry = entries[active];
			if (entry) openView(entry);
		},
		onReachEnd: onLoadMore,
		containerRef,
	});

	return (
		<div ref={containerRef} className="flex flex-col gap-6">
			{days.map((day) => (
				<section key={day.date} className="flex flex-col gap-1">
					<div className="flex items-baseline justify-between border-b pb-1">
						<h3 className="font-heading text-sm font-semibold">
							{formatEntryDate(day.date, i18n.language, {
								month: "short",
								day: "numeric",
								weekday: "short",
								...(day.date.startsWith(currentYear)
									? {}
									: { year: "numeric" }),
							})}
						</h3>
						<span className="text-muted-foreground text-sm tabular-nums">
							{formatDuration(day.totalMinutes)}
						</span>
					</div>
					<ul>
						{day.entries.map((entry) => (
							// The row body is a button (opens the detail dialog); the actions
							// menu is a sibling so buttons are never nested.
							<li
								key={entry.id}
								data-nav-index={indexById.get(entry.id)}
								data-nav-active={
									active >= 0 && active === indexById.get(entry.id)
										? ""
										: undefined
								}
								className="group hover:bg-muted/50 data-[nav-active]:bg-muted flex items-center gap-1 border-b transition-colors last:border-b-0"
							>
								<button
									type="button"
									onClick={() => openView(entry)}
									className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
								>
									<span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
										<span className="text-sm">{entry.description}</span>
										<Badge variant="outline">
											{projectName(entry.projectId)}
										</Badge>
										{entry.tags.map((tag) => (
											<Badge key={tag} variant="secondary">
												{tag}
											</Badge>
										))}
									</span>
									<span className="text-muted-foreground text-sm whitespace-nowrap tabular-nums">
										{formatDuration(entry.durationMinutes)}
									</span>
								</button>
								<EntryActions entry={entry} />
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
