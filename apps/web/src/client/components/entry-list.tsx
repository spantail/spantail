import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project, WorkEntry, WorkspaceMember } from "@toxil/core";
import { formatDuration } from "@toxil/core";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

interface EntryListProps {
	workspaceId: string;
	entries: WorkEntry[];
	projects: Project[];
	members: WorkspaceMember[];
	currentUserId: string;
	onEdit: (entry: WorkEntry) => void;
}

export function EntryList({
	workspaceId,
	entries,
	projects,
	members,
	currentUserId,
	onEdit,
}: EntryListProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const projectName = (id: string) =>
		projects.find((p) => p.id === id)?.name ?? id;
	const memberName = (id: string) =>
		members.find((m) => m.userId === id)?.name ?? id;

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteWorkEntry(id),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["work-entries", workspaceId],
			}),
	});

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
					<TableHead>{t("entries.date")}</TableHead>
					<TableHead>{t("entries.project")}</TableHead>
					<TableHead>{t("entries.author")}</TableHead>
					<TableHead className="text-right">{t("entries.duration")}</TableHead>
					<TableHead className="w-full">{t("entries.description")}</TableHead>
					<TableHead />
				</TableRow>
			</TableHeader>
			<TableBody>
				{entries.map((entry) => (
					<TableRow key={entry.id}>
						<TableCell className="whitespace-nowrap">
							{entry.entryDate}
						</TableCell>
						<TableCell className="whitespace-nowrap">
							{projectName(entry.projectId)}
						</TableCell>
						<TableCell className="whitespace-nowrap">
							{memberName(entry.userId)}
						</TableCell>
						<TableCell className="text-right whitespace-nowrap tabular-nums">
							{formatDuration(entry.durationMinutes)}
						</TableCell>
						<TableCell>
							<div className="flex flex-wrap items-center gap-1">
								<span>{entry.description}</span>
								{entry.tags.map((tag) => (
									<Badge key={tag} variant="secondary">
										{tag}
									</Badge>
								))}
							</div>
						</TableCell>
						<TableCell className="whitespace-nowrap">
							{entry.userId === currentUserId && (
								<div className="flex justify-end gap-1">
									<Button
										variant="ghost"
										size="icon"
										aria-label={t("entries.editAction")}
										onClick={() => onEdit(entry)}
									>
										<PencilIcon />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										aria-label={t("entries.deleteAction")}
										onClick={() => deleteMutation.mutate(entry.id)}
									>
										<Trash2Icon />
									</Button>
								</div>
							)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
