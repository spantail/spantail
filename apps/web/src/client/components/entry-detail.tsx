import { formatDuration, type WorkEntry } from "@toxil/core";
import { CalendarIcon, ClockIcon, FolderIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { MarkdownView } from "@/components/markdown-view";
import { Badge } from "@/components/ui/badge";

interface EntryDetailProps {
	entry: WorkEntry;
	projectName: string;
	dateLabel: string;
	/** Local start–end time range, when both ends are recorded. */
	timeRange: string | null;
	/** Author's display name; null when the viewer owns the entry. */
	authorName: string | null;
}

/**
 * Read-only body of a work entry, shown in the entry dialog: a metadata panel
 * (project / date / duration), tags, the note, and an author byline for
 * entries the viewer doesn't own.
 */
export function EntryDetail({
	entry,
	projectName,
	dateLabel,
	timeRange,
	authorName,
}: EntryDetailProps) {
	const { t } = useTranslation();

	return (
		<div className="flex flex-col gap-5">
			<div className="bg-muted/40 grid grid-cols-1 gap-4 rounded-xl border p-4 sm:grid-cols-3">
				<MetaItem
					icon={<FolderIcon className="size-3.5" />}
					label={t("entries.project")}
					value={projectName}
				/>
				<MetaItem
					icon={<CalendarIcon className="size-3.5" />}
					label={t("entries.date")}
					value={dateLabel}
				/>
				<MetaItem
					icon={<ClockIcon className="size-3.5" />}
					label={t("entries.durationColumn")}
					value={
						<span className="flex flex-wrap items-baseline gap-x-1.5">
							<span className="tabular-nums">
								{formatDuration(entry.durationMinutes)}
							</span>
							{timeRange && (
								<span className="text-muted-foreground text-xs font-normal tabular-nums">
									{timeRange}
								</span>
							)}
						</span>
					}
				/>
			</div>

			{entry.tags.length > 0 && (
				<div className="flex flex-col gap-2">
					<MetaLabel>{t("entries.tags")}</MetaLabel>
					<div className="flex flex-wrap gap-1.5">
						{entry.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								{tag}
							</Badge>
						))}
					</div>
				</div>
			)}

			<div className="flex flex-col gap-2">
				<MetaLabel>{t("entries.note")}</MetaLabel>
				{entry.note?.trim() ? (
					<MarkdownView markdown={entry.note} />
				) : (
					<p className="text-muted-foreground text-sm italic">
						{t("entries.noNote")}
					</p>
				)}
			</div>

			{authorName && (
				<div className="text-muted-foreground flex items-center gap-2 border-t pt-3 text-sm">
					<span className="bg-secondary text-secondary-foreground flex size-6 items-center justify-center rounded-full text-[10px] font-semibold">
						{initials(authorName)}
					</span>
					{t("entries.loggedBy", { name: authorName })}
				</div>
			)}
		</div>
	);
}

function MetaLabel({ children }: { children: ReactNode }) {
	return (
		<p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
			{children}
		</p>
	);
}

function MetaItem({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: ReactNode;
}) {
	return (
		<div className="flex items-start gap-2.5">
			<div className="bg-background text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
				{icon}
			</div>
			<div className="min-w-0">
				<MetaLabel>{label}</MetaLabel>
				<div className="mt-0.5 text-sm font-medium">{value}</div>
			</div>
		</div>
	);
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}
