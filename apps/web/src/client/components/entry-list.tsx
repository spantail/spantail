import type { Project, WorkEntry, WorkspaceMember } from "@toxil/core";
import { formatDuration } from "@toxil/core";
import { useTranslation } from "react-i18next";

import { EntryActions } from "@/components/entry-actions";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

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
	const { t } = useTranslation();
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
					<TableHead className="text-muted-foreground text-right text-xs">
						{t("entries.duration")}
					</TableHead>
					<TableHead className="text-muted-foreground w-full text-xs">
						{t("entries.description")}
					</TableHead>
					<TableHead />
				</TableRow>
			</TableHeader>
			<TableBody>
				{entries.map((entry) => (
					<TableRow key={entry.id} className="group">
						<TableCell className="text-muted-foreground whitespace-nowrap">
							{entry.entryDate}
						</TableCell>
						{showProject && (
							<TableCell className="whitespace-nowrap">
								{projectName(entry.projectId)}
							</TableCell>
						)}
						<TableCell className="whitespace-nowrap">
							{memberName(entry.userId)}
						</TableCell>
						<TableCell className="text-muted-foreground text-right whitespace-nowrap tabular-nums">
							{formatDuration(entry.durationMinutes)}
						</TableCell>
						<TableCell>
							<div className="flex flex-wrap items-center gap-1.5">
								<span>{entry.description}</span>
								{entry.tags.map((tag) => (
									<Badge key={tag} variant="secondary">
										{tag}
									</Badge>
								))}
							</div>
						</TableCell>
						<TableCell className="whitespace-nowrap">
							<div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
								<EntryActions entry={entry} />
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
