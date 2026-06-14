import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Project, WorkEntry } from "@toxil/core";
import { todayInTimezone } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { invalidateWorkEntryData } from "@/lib/query";

interface EntryFormProps {
	workspaceId: string;
	timezone: string;
	projects: Project[];
	initial: WorkEntry | null;
	defaultProjectId?: string;
	onSuccess: () => void;
	onCancel: () => void;
}

/**
 * Create/edit form hosted by the entry dialog. Mounted fresh per open (the
 * dialog keys it), so all state derives from props in the initializers.
 */
export function EntryForm({
	workspaceId,
	timezone,
	projects,
	initial,
	defaultProjectId,
	onSuccess,
	onCancel,
}: EntryFormProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [projectId, setProjectId] = useState(
		initial?.projectId ?? defaultProjectId ?? "",
	);
	const [entryDate, setEntryDate] = useState(
		initial?.entryDate ?? todayInTimezone(timezone),
	);
	const [duration, setDuration] = useState(
		initial ? String(initial.durationMinutes) : "",
	);
	const [description, setDescription] = useState(initial?.description ?? "");
	const [note, setNote] = useState(initial?.note ?? "");
	const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () => {
			const payload = {
				projectId,
				entryDate,
				durationMinutes: Number(duration),
				description,
				note: note.trim() === "" ? undefined : note,
				tags: tags
					.split(",")
					.map((tag) => tag.trim())
					.filter(Boolean),
			};
			return initial
				? api.updateWorkEntry(initial.id, {
						...payload,
						note: payload.note ?? null,
					})
				: api.createWorkEntry({ workspaceId, ...payload });
		},
		onSuccess: () => {
			invalidateWorkEntryData(queryClient, workspaceId);
			onSuccess();
		},
		onError: (err: Error) => setError(err.message),
	});

	const activeProjects = projects.filter((p) => p.status === "active");

	if (activeProjects.length === 0 && !initial) {
		return (
			<div className="flex flex-col items-start gap-3">
				<p className="text-muted-foreground text-sm">
					{t("entries.noProjects")}
				</p>
				<Button asChild variant="outline" onClick={onCancel}>
					<Link to="/settings">{t("entries.goToSettings")}</Link>
				</Button>
			</div>
		);
	}

	return (
		<form
			className="grid gap-5 sm:grid-cols-2"
			onSubmit={(e) => {
				e.preventDefault();
				setError(null);
				mutation.mutate();
			}}
		>
			<div className="flex flex-col gap-2">
				<Label>{t("entries.project")}</Label>
				<Select value={projectId} onValueChange={setProjectId} required>
					<SelectTrigger>
						<SelectValue placeholder={t("entries.selectProject")} />
					</SelectTrigger>
					<SelectContent>
						{activeProjects.map((project) => (
							<SelectItem key={project.id} value={project.id}>
								{project.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="entry-date">{t("entries.date")}</Label>
				<Input
					id="entry-date"
					type="date"
					value={entryDate}
					onChange={(e) => setEntryDate(e.target.value)}
					required
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="entry-duration">{t("entries.duration")}</Label>
				<Input
					id="entry-duration"
					type="number"
					min={1}
					step={1}
					placeholder="60"
					value={duration}
					onChange={(e) => setDuration(e.target.value)}
					required
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="entry-tags">{t("entries.tags")}</Label>
				<Input
					id="entry-tags"
					placeholder={t("entries.tagsPlaceholder")}
					value={tags}
					onChange={(e) => setTags(e.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-2 sm:col-span-2">
				<Label htmlFor="entry-description">{t("entries.description")}</Label>
				<Input
					id="entry-description"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder={t("entries.descriptionPlaceholder")}
					required
				/>
			</div>
			<div className="flex flex-col gap-2 sm:col-span-2">
				<Label htmlFor="entry-note">{t("entries.note")}</Label>
				<Textarea
					id="entry-note"
					value={note}
					onChange={(e) => setNote(e.target.value)}
					rows={2}
				/>
			</div>
			{error && (
				<p className="text-destructive text-sm sm:col-span-2">{error}</p>
			)}
			<DialogFooter className="sm:col-span-2">
				<Button type="button" variant="outline" onClick={onCancel}>
					{t("entries.cancelAction")}
				</Button>
				<Button type="submit" disabled={mutation.isPending || !projectId}>
					{initial ? t("entries.saveAction") : t("entries.logAction")}
				</Button>
			</DialogFooter>
		</form>
	);
}
