import type { Project, WorkEntry } from "@toxil/core";
import { formatDuration } from "@toxil/core";
import { CalendarIcon, ClockIcon, FolderIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MarkdownView } from "@/components/markdown-view";
import { Badge } from "@/components/ui/badge";
import { formatEntryDate } from "@/lib/format";

/** Read-only detail view of a work entry, shown in the entry dialog. */
export function EntryDetail({
	entry,
	projects,
}: {
	entry: WorkEntry;
	projects: Project[];
}) {
	const { t, i18n } = useTranslation();
	const projectName =
		projects.find((p) => p.id === entry.projectId)?.name ?? entry.projectId;

	return (
		<div className="flex flex-col gap-4">
			<div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
				<span className="flex items-center gap-1.5">
					<FolderIcon className="size-4" />
					{projectName}
				</span>
				<span className="flex items-center gap-1.5">
					<CalendarIcon className="size-4" />
					{formatEntryDate(entry.entryDate, i18n.language, {
						year: "numeric",
						month: "short",
						day: "numeric",
						weekday: "short",
					})}
				</span>
				<span className="flex items-center gap-1.5 tabular-nums">
					<ClockIcon className="size-4" />
					{formatDuration(entry.durationMinutes)}
				</span>
			</div>

			<p className="text-sm font-medium">{entry.description}</p>

			{entry.tags.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{entry.tags.map((tag) => (
						<Badge key={tag} variant="secondary">
							{tag}
						</Badge>
					))}
				</div>
			)}

			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">{t("entries.note")}</h3>
				{entry.note?.trim() ? (
					<MarkdownView markdown={entry.note} />
				) : (
					<p className="text-muted-foreground text-sm">{t("entries.noNote")}</p>
				)}
			</div>
		</div>
	);
}
