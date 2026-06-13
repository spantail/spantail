import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	DateRangePreset,
	Report,
	ReportFilters,
	ReportTemplate,
} from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useWorkspace } from "@/lib/workspace";

const PRESETS: DateRangePreset[] = [
	"today",
	"yesterday",
	"this_week",
	"last_week",
	"this_month",
	"last_month",
];

export function ReportForm({
	templates,
	templatesReady,
	editing,
	onDone,
	onCancel,
}: {
	templates: ReportTemplate[];
	templatesReady: boolean;
	editing: Report | null;
	onDone: () => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { workspaces, current } = useWorkspace();
	const filters = editing?.filters;

	const [name, setName] = useState(editing?.name ?? "");
	const [templateId, setTemplateId] = useState(
		editing?.templateId ?? "builtin:daily",
	);
	// Saved filters may reference workspaces the user has since left; those
	// can be neither displayed nor saved, so drop them from the editable
	// filters. The project filter belonged to the original workspace selection,
	// so it is dropped with it — stale project ids would save fine but render
	// an empty report.
	const memberIds = new Set(workspaces.map((workspace) => workspace.id));
	const keptWorkspaceIds =
		filters?.workspaceIds.filter((id) => memberIds.has(id)) ?? [];
	const filtersIntact =
		!filters || keptWorkspaceIds.length === filters.workspaceIds.length;

	const [workspaceIds, setWorkspaceIds] = useState<string[]>(() => {
		const fallback = current ? [current.id] : [];
		if (!filters) return fallback;
		return keptWorkspaceIds.length > 0 ? keptWorkspaceIds : fallback;
	});
	const [projectIds, setProjectIds] = useState<string[]>(
		filtersIntact ? (filters?.projectIds ?? []) : [],
	);
	const [rangeChoice, setRangeChoice] = useState<DateRangePreset | "custom">(
		typeof filters?.dateRange === "string" ? filters.dateRange : "custom",
	);
	const [from, setFrom] = useState(
		typeof filters?.dateRange === "object" ? filters.dateRange.from : "",
	);
	const [to, setTo] = useState(
		typeof filters?.dateRange === "object" ? filters.dateRange.to : "",
	);
	const [tags, setTags] = useState(filters?.tags?.join(", ") ?? "");
	const [note, setNote] = useState(editing?.note ?? "");
	const [error, setError] = useState<string | null>(null);

	// A custom template must belong to a filtered workspace (server rule);
	// builtins are always available. Clamping at render also covers editing a
	// report whose template's workspace is no longer selectable — but only
	// once the template union is fully loaded, or a still-pending custom
	// template would be silently replaced by the builtin.
	const availableTemplates = templates.filter(
		(template) =>
			template.builtin ||
			(template.workspaceId && workspaceIds.includes(template.workspaceId)),
	);
	const selectedTemplateId =
		!templatesReady ||
		availableTemplates.some((template) => template.id === templateId)
			? templateId
			: "builtin:daily";

	// Per-project filtering only makes sense within a single workspace.
	const singleWorkspaceId = workspaceIds.length === 1 ? workspaceIds[0] : null;
	const projects = useQuery({
		queryKey: ["projects", singleWorkspaceId],
		queryFn: () => api.listProjects(singleWorkspaceId ?? ""),
		enabled: Boolean(singleWorkspaceId),
	});

	const mutation = useMutation({
		mutationFn: () => {
			const parsedTags = tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean);
			const reportFilters: ReportFilters = {
				workspaceIds,
				...(singleWorkspaceId && projectIds.length > 0 ? { projectIds } : {}),
				...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
				dateRange: rangeChoice === "custom" ? { from, to } : rangeChoice,
			};
			const input = {
				name,
				templateId: selectedTemplateId,
				filters: reportFilters,
				note,
			};
			return editing
				? api.updateReport(editing.id, input)
				: api.createReport(input);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["reports"] });
			setError(null);
			onDone();
		},
		onError: (err: Error) => setError(err.message),
	});

	const toggle = (
		list: string[],
		setList: (next: string[]) => void,
		id: string,
	) => {
		setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
	};

	const toggleWorkspace = (id: string) => {
		toggle(workspaceIds, setWorkspaceIds, id);
		// The project filter belongs to the previous workspace selection.
		setProjectIds([]);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{editing ? t("reports.editTitle") : t("reports.newTitle")}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						mutation.mutate();
					}}
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="report-name">{t("reports.name")}</Label>
							<Input
								id="report-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("reports.template")}</Label>
							<Select value={selectedTemplateId} onValueChange={setTemplateId}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{availableTemplates.map((template) => (
										<SelectItem key={template.id} value={template.id}>
											{template.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{workspaces.length > 1 && (
						<div className="flex flex-col gap-2">
							<Label>{t("reports.workspaces")}</Label>
							<div className="flex flex-wrap gap-4">
								{workspaces.map((workspace) => (
									<label
										key={workspace.id}
										htmlFor={`report-ws-${workspace.id}`}
										className="flex items-center gap-2 text-sm"
									>
										<Checkbox
											id={`report-ws-${workspace.id}`}
											checked={workspaceIds.includes(workspace.id)}
											onCheckedChange={() => toggleWorkspace(workspace.id)}
										/>
										{workspace.name}
									</label>
								))}
							</div>
						</div>
					)}

					<div className="grid gap-4 sm:grid-cols-3">
						<div className="flex flex-col gap-2">
							<Label>{t("reports.dateRange")}</Label>
							<Select
								value={rangeChoice}
								onValueChange={(v) =>
									setRangeChoice(v as DateRangePreset | "custom")
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PRESETS.map((preset) => (
										<SelectItem key={preset} value={preset}>
											{t(`reports.range.${preset}`)}
										</SelectItem>
									))}
									<SelectItem value="custom">
										{t("reports.range.custom")}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{rangeChoice === "custom" && (
							<>
								<div className="flex flex-col gap-2">
									<Label htmlFor="report-from">{t("reports.from")}</Label>
									<Input
										id="report-from"
										type="date"
										value={from}
										onChange={(e) => setFrom(e.target.value)}
										required
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="report-to">{t("reports.to")}</Label>
									<Input
										id="report-to"
										type="date"
										value={to}
										onChange={(e) => setTo(e.target.value)}
										required
									/>
								</div>
							</>
						)}
					</div>

					{singleWorkspaceId && (projects.data?.length ?? 0) > 0 && (
						<div className="flex flex-col gap-2">
							<Label>{t("reports.projects")}</Label>
							<div className="flex flex-wrap gap-4">
								{(projects.data ?? []).map((project) => (
									<label
										key={project.id}
										htmlFor={`report-prj-${project.id}`}
										className="flex items-center gap-2 text-sm"
									>
										<Checkbox
											id={`report-prj-${project.id}`}
											checked={projectIds.includes(project.id)}
											onCheckedChange={() =>
												toggle(projectIds, setProjectIds, project.id)
											}
										/>
										{project.name}
									</label>
								))}
							</div>
							<p className="text-muted-foreground text-xs">
								{t("reports.allProjects")}
							</p>
						</div>
					)}

					<div className="flex flex-col gap-2">
						<Label htmlFor="report-tags">{t("reports.tags")}</Label>
						<Input
							id="report-tags"
							value={tags}
							onChange={(e) => setTags(e.target.value)}
							placeholder={t("reports.tagsPlaceholder")}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="report-note">{t("reports.note")}</Label>
						<Textarea
							id="report-note"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							rows={6}
							placeholder={t("reports.notePlaceholder")}
						/>
					</div>

					{error && <p className="text-destructive text-sm">{error}</p>}
					<div className="flex gap-2">
						<Button
							type="submit"
							disabled={
								mutation.isPending ||
								workspaceIds.length === 0 ||
								!templatesReady
							}
						>
							{editing ? t("reports.saveAction") : t("reports.createAction")}
						</Button>
						{editing && (
							<Button type="button" variant="ghost" onClick={onCancel}>
								{t("reports.cancelAction")}
							</Button>
						)}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
