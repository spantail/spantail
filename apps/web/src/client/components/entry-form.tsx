import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project, WorkEntry } from "@toxil/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function browserToday(): string {
	return new Intl.DateTimeFormat("en-CA", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

interface EntryFormProps {
	workspaceId: string;
	projects: Project[];
	editing: WorkEntry | null;
	onDone: () => void;
}

export function EntryForm({
	workspaceId,
	projects,
	editing,
	onDone,
}: EntryFormProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [projectId, setProjectId] = useState("");
	const [entryDate, setEntryDate] = useState(browserToday);
	const [duration, setDuration] = useState("");
	const [description, setDescription] = useState("");
	const [note, setNote] = useState("");
	const [tags, setTags] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (editing) {
			setProjectId(editing.projectId);
			setEntryDate(editing.entryDate);
			setDuration(String(editing.durationMinutes));
			setDescription(editing.description);
			setNote(editing.note ?? "");
			setTags(editing.tags.join(", "));
		}
	}, [editing]);

	function reset() {
		setProjectId("");
		setEntryDate(browserToday());
		setDuration("");
		setDescription("");
		setNote("");
		setTags("");
		setError(null);
	}

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
			return editing
				? api.updateWorkEntry(editing.id, {
						...payload,
						note: payload.note ?? null,
					})
				: api.createWorkEntry({ workspaceId, ...payload });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["work-entries", workspaceId],
			});
			reset();
			onDone();
		},
		onError: (err: Error) => setError(err.message),
	});

	const activeProjects = projects.filter((p) => p.status === "active");

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{editing ? t("entries.editTitle") : t("entries.newTitle")}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
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
					<div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
						<Label htmlFor="entry-description">
							{t("entries.description")}
						</Label>
						<Input
							id="entry-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder={t("entries.descriptionPlaceholder")}
							required
						/>
					</div>
					<div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
						<Label htmlFor="entry-note">{t("entries.note")}</Label>
						<Textarea
							id="entry-note"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							rows={2}
						/>
					</div>
					{error && (
						<p className="text-destructive text-sm sm:col-span-2 lg:col-span-4">
							{error}
						</p>
					)}
					<div className="flex gap-2 sm:col-span-2 lg:col-span-4">
						<Button type="submit" disabled={mutation.isPending || !projectId}>
							{editing ? t("entries.saveAction") : t("entries.logAction")}
						</Button>
						{editing && (
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									reset();
									onDone();
								}}
							>
								{t("entries.cancelAction")}
							</Button>
						)}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
