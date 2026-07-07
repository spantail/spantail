import type { Project, WorkEntry, WorkspaceMember } from "@spantail/core";
import { formatDuration } from "@spantail/core";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { EntryActions } from "@/components/entry-actions";
import { useEntryDialog } from "@/components/entry-dialog";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useEntryRowNav } from "@/hooks/use-entry-row-nav";
import { formatEntryDate } from "@/lib/format";

interface EntryListProps {
	entries: WorkEntry[];
	projects: Project[];
	members: WorkspaceMember[];
	showProject?: boolean;
	/** Loads the next page when keyboard nav reaches the last entry. */
	onLoadMore?: () => void;
}

/** Tabular all-members entry list (author column, own-row actions). */
export function EntryList({
	entries,
	projects,
	members,
	showProject = true,
	onLoadMore,
}: EntryListProps) {
	const { t, i18n } = useTranslation();
	const { openView } = useEntryDialog();
	const projectName = (id: string | null) =>
		id
			? (projects.find((p) => p.id === id)?.name ?? id)
			: t("projects.unassigned");
	const memberById = useMemo(
		() => new Map(members.map((m) => [m.userId, m])),
		[members],
	);
	const memberName = (id: string) => memberById.get(id)?.name ?? id;

	const containerRef = useRef<HTMLDivElement>(null);
	const { activeIndex } = useEntryRowNav(entries, containerRef, onLoadMore);

	if (entries.length === 0) {
		return (
			<p className="text-muted-foreground p-4 text-center text-sm">
				{t("entries.empty")}
			</p>
		);
	}

	return (
		<div ref={containerRef}>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="text-muted-foreground text-xs">
							{t("entries.date")}
						</TableHead>
						{showProject && (
							<TableHead className="text-muted-foreground text-xs">
								{t("entries.project")}
							</TableHead>
						)}
						<TableHead className="text-muted-foreground text-xs">
							{t("entries.author")}
						</TableHead>
						<TableHead className="text-muted-foreground w-full text-xs">
							{t("entries.description")}
						</TableHead>
						<TableHead className="text-muted-foreground text-right text-xs">
							{t("entries.durationColumn")}
						</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{entries.map((entry, index) => (
						// The whole row opens the detail dialog: the description button's
						// stretched overlay (`before:inset-0`) covers the relative row, so a
						// real button keeps it keyboard-accessible and lint-clean — no click
						// handler on the <tr>. The actions cell is raised above the overlay.
						<TableRow
							key={entry.id}
							data-nav-index={index}
							data-nav-active={activeIndex === index ? "" : undefined}
							className="group data-[nav-active]:bg-muted relative cursor-pointer"
						>
							<TableCell className="text-muted-foreground py-3 whitespace-nowrap">
								{formatEntryDate(entry.entryDate, i18n.language, {
									weekday: "short",
									month: "short",
									day: "numeric",
								})}
							</TableCell>
							{showProject && (
								<TableCell className="py-3 whitespace-nowrap">
									{projectName(entry.projectId)}
								</TableCell>
							)}
							<TableCell className="py-3 whitespace-nowrap">
								<span className="flex items-center gap-2">
									<PersonAvatar
										name={memberName(entry.userId)}
										imageUrl={memberById.get(entry.userId)?.imageUrl}
										size={22}
									/>
									{memberName(entry.userId)}
								</span>
							</TableCell>
							<TableCell className="py-3 whitespace-normal">
								<button
									type="button"
									onClick={() => openView(entry)}
									className="flex flex-wrap items-center gap-1.5 text-left before:absolute before:inset-0 before:content-['']"
								>
									<span className="min-w-0 break-words underline-offset-4 decoration-foreground/20 group-hover:underline">
										{entry.description}
									</span>
									{entry.tags.map((tag) => (
										<Badge key={tag} variant="secondary">
											{tag}
										</Badge>
									))}
								</button>
							</TableCell>
							<TableCell className="text-muted-foreground py-3 text-right whitespace-nowrap tabular-nums">
								{formatDuration(entry.durationMinutes)}
							</TableCell>
							<TableCell className="relative z-10 py-3 whitespace-nowrap">
								<EntryActions entry={entry} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
