import { formatDuration, type WorkEntry } from "@spantail/core";
import {
	CalendarIcon,
	ClockIcon,
	CodeIcon,
	FolderIcon,
	GlobeIcon,
	type LucideIcon,
	PlugIcon,
	TerminalIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Dot } from "@/components/dot";
import { MarkdownView } from "@/components/markdown-view";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";

/** Provenance chip icon per logging route. */
const SOURCE_ICONS: Record<WorkEntry["source"], LucideIcon> = {
	web: GlobeIcon,
	cli: TerminalIcon,
	mcp: PlugIcon,
	api: CodeIcon,
};

interface EntryDetailProps {
	entry: WorkEntry;
	projectName: string;
	/** Project's OKLCH hue for the color dot; null when unassigned. */
	projectHue: number | null;
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
	projectHue,
	dateLabel,
	timeRange,
	authorName,
}: EntryDetailProps) {
	const { t } = useTranslation();
	const SourceIcon = SOURCE_ICONS[entry.source];
	const sourceLabel = t(`entries.sources.${entry.source}`);

	return (
		<div className="flex flex-col gap-5">
			<div className="bg-muted/40 grid grid-cols-1 gap-4 rounded-xl border p-4 sm:grid-cols-3">
				<MetaItem
					icon={<FolderIcon className="size-3.5" />}
					label={t("entries.project")}
					value={
						projectHue != null ? (
							<span className="flex items-center gap-1.5">
								<Dot hue={projectHue} />
								{projectName}
							</span>
						) : (
							projectName
						)
					}
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

			<div className="flex items-center justify-between gap-3 border-t pt-3">
				{authorName ? (
					<div className="flex min-w-0 items-center gap-2">
						<PersonAvatar name={authorName} size={24} />
						<span className="text-muted-foreground truncate text-sm">
							{authorName}
						</span>
					</div>
				) : (
					<span />
				)}
				<span
					title={`${t("entries.source")} ${sourceLabel}`}
					className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium"
				>
					<SourceIcon className="text-muted-foreground size-3" />
					{sourceLabel}
				</span>
			</div>
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
