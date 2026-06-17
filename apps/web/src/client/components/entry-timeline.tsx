import type { Project, WorkEntry } from "@toxil/core";
import { formatDuration } from "@toxil/core";
import { useTranslation } from "react-i18next";

import { EntryActions } from "@/components/entry-actions";
import { useEntryDialog } from "@/components/entry-dialog";
import { Badge } from "@/components/ui/badge";
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
}

/** The personal work log: entries grouped under date headers. */
export function EntryTimeline({ entries, projects }: EntryTimelineProps) {
	const { i18n } = useTranslation();
	const { openView } = useEntryDialog();
	const projectName = (id: string) =>
		projects.find((p) => p.id === id)?.name ?? id;
	const currentYear = String(new Date().getFullYear());

	return (
		<div className="flex flex-col gap-6">
			{groupEntriesByDate(entries).map((day) => (
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
								className="group hover:bg-muted/50 flex items-center gap-1 border-b transition-colors last:border-b-0"
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
