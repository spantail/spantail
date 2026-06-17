import type { Project, WorkEntry, WorkspaceMember } from "@toxil/core";
import { formatDuration } from "@toxil/core";
import { useTranslation } from "react-i18next";

import { EntryActions } from "@/components/entry-actions";
import { useEntryDialog } from "@/components/entry-dialog";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatEntryDate } from "@/lib/format";

interface EntryListProps {
	entries: WorkEntry[];
	projects: Project[];
	members: WorkspaceMember[];
	showProject?: boolean;
}

/** Tabular all-members entry list (author column, own-row actions). */
export function EntryList({
	entries,
	projects,
	members,
	showProject = true,
}: EntryListProps) {
	const { t, i18n } = useTranslation();
	const { openView } = useEntryDialog();
	const projectName = (id: string) =>
		projects.find((p) => p.id === id)?.name ?? id;
	const memberName = (id: string) =>
		members.find((m) => m.userId === id)?.name ?? id;

	if (entries.length === 0) {
		return (
			<p className="text-muted-foreground p-4 text-center text-sm">
				{t("entries.empty")}
			</p>
		);
	}

	return (
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
				{entries.map((entry) => (
					<TableRow key={entry.id}>
						<TableCell className="text-muted-foreground whitespace-nowrap">
							{formatEntryDate(entry.entryDate, i18n.language, {
								weekday: "short",
								month: "short",
								day: "numeric",
							})}
						</TableCell>
						{showProject && (
							<TableCell className="whitespace-nowrap">
								{projectName(entry.projectId)}
							</TableCell>
						)}
						<TableCell className="whitespace-nowrap">
							{memberName(entry.userId)}
						</TableCell>
						<TableCell>
							{/* The description opens the detail dialog; kept a button (not a
							    row handler) so it stays keyboard-accessible and lint-clean. */}
							<button
								type="button"
								onClick={() => openView(entry)}
								aria-label={t("entries.viewDetails")}
								className="flex flex-wrap items-center gap-1.5 text-left hover:underline"
							>
								<span>{entry.description}</span>
								{entry.tags.map((tag) => (
									<Badge key={tag} variant="secondary">
										{tag}
									</Badge>
								))}
							</button>
						</TableCell>
						<TableCell className="text-muted-foreground text-right whitespace-nowrap tabular-nums">
							{formatDuration(entry.durationMinutes)}
						</TableCell>
						<TableCell className="whitespace-nowrap">
							<EntryActions entry={entry} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
