import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type DateRangePreset,
	formatPeriodLabel,
	MAX_REPORT_SPAN_DAYS,
	type Report,
	type ReportFiltersInput,
	type ReportTemplate,
	resolveDateRange,
} from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useWorkspace } from "@/lib/workspace";

const PRESETS: DateRangePreset[] = [
	"today",
	"yesterday",
	"this_week",
	"last_week",
	"this_month",
	"last_month",
];

/** Initial field values; the route seeds these for create/edit/duplicate. */
export interface ReportFormSeed {
	name: string;
	/** When false, the name auto-updates from period + user name until edited. */
	nameEdited: boolean;
	templateId: string;
	workspaceIds: string[];
	projectIds: string[];
	rangeChoice: DateRangePreset | "custom";
	from: string;
	to: string;
	tags: string;
	note: string;
}

function spanDays(from: string, to: string): number {
	const utcMs = (date: string) => {
		const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
		return Date.UTC(y, m - 1, d);
	};
	return (utcMs(to) - utcMs(from)) / 86_400_000 + 1;
}

/**
 * Create/edit form for a report document. Submitting renders the report in one
 * call (no separate run step); a template/validation error surfaces inline and
 * keeps the dialog open so nothing half-saves.
 */
export function ReportForm({
	templates,
	templatesReady,
	editingId,
	seed,
	onComplete,
	onCancel,
}: {
	templates: ReportTemplate[];
	templatesReady: boolean;
	editingId: string | null;
	seed: ReportFormSeed;
	/** Called after save with the rendered report so the viewer can open. */
	onComplete: (report: Report) => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { workspaces, current } = useWorkspace();
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
	const userName = me.data?.user.name ?? "";

	const memberIds = new Set(workspaces.map((w) => w.id));
	const seededWorkspaceIds = seed.workspaceIds.filter((id) =>
		memberIds.has(id),
	);
	// If a seeded workspace was dropped (lost membership), its project filter
	// belongs to a workspace that is no longer selected; keep projects only when
	// the workspace set is intact so submit can't send a hidden, empty-rendering
	// project filter.
	const filtersIntact = seededWorkspaceIds.length === seed.workspaceIds.length;

	const [name, setName] = useState(seed.name);
	const [nameEdited, setNameEdited] = useState(seed.nameEdited);
	const [templateId, setTemplateId] = useState(seed.templateId);
	const [workspaceIds, setWorkspaceIds] = useState<string[]>(
		seededWorkspaceIds.length > 0
			? seededWorkspaceIds
			: current
				? [current.id]
				: [],
	);
	const [projectIds, setProjectIds] = useState<string[]>(
		filtersIntact ? seed.projectIds : [],
	);
	const [rangeChoice, setRangeChoice] = useState<DateRangePreset | "custom">(
		seed.rangeChoice,
	);
	const [from, setFrom] = useState(seed.from);
	const [to, setTo] = useState(seed.to);
	const [tags, setTags] = useState(seed.tags);
	const [note, setNote] = useState(seed.note);
	const [error, setError] = useState<string | null>(null);

	// Templates are instance-wide formats, available for any scope. Disabled
	// templates are archived — but always keep the current selection available.
	const availableTemplates = templates.filter(
		(template) => template.enabled || template.id === templateId,
	);
	const selectedTemplateId =
		!templatesReady ||
		availableTemplates.some((template) => template.id === templateId)
			? templateId
			: (availableTemplates[0]?.id ?? "builtin:daily");

	const singleWorkspaceId = workspaceIds.length === 1 ? workspaceIds[0] : null;
	const projects = useQuery({
		queryKey: ["projects", singleWorkspaceId],
		queryFn: () => api.listProjects(singleWorkspaceId ?? ""),
		enabled: Boolean(singleWorkspaceId),
	});

	const anchorTimezone =
		workspaces.find((w) => w.id === workspaceIds[0])?.timezone ??
		current?.timezone ??
		"UTC";

	// Resolved period label for the smart default name and span check.
	const customValid =
		rangeChoice !== "custom" || (from !== "" && to !== "" && from <= to);
	const resolvedLabel =
		rangeChoice === "custom"
			? customValid && from !== "" && to !== ""
				? formatPeriodLabel({ from, to })
				: null
			: formatPeriodLabel(resolveDateRange(rangeChoice, anchorTimezone));
	// Smart default name: "<workspace> <user> <period>" when scoped to a single
	// workspace, otherwise "<user> <period>" (cross-workspace or none selected).
	const singleWorkspaceName = singleWorkspaceId
		? (workspaces.find((w) => w.id === singleWorkspaceId)?.name ?? "")
		: "";
	const autoName = resolvedLabel
		? [singleWorkspaceName, userName, resolvedLabel].filter(Boolean).join(" ")
		: "";
	const effectiveName = nameEdited ? name : autoName;
	const spanTooLong =
		rangeChoice === "custom" &&
		from !== "" &&
		to !== "" &&
		from <= to &&
		spanDays(from, to) > MAX_REPORT_SPAN_DAYS;

	const mutation = useMutation({
		mutationFn: async (): Promise<Report> => {
			const parsedTags = tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean);
			const filters: ReportFiltersInput = {
				workspaceIds,
				...(singleWorkspaceId && projectIds.length > 0 ? { projectIds } : {}),
				...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
				dateRange: rangeChoice === "custom" ? { from, to } : rangeChoice,
			};
			const input = {
				name: effectiveName,
				templateId: selectedTemplateId,
				filters,
				note,
			};
			return editingId
				? api.updateReport(editingId, input)
				: api.createReport(input);
		},
		onSuccess: async (report) => {
			await queryClient.invalidateQueries({ queryKey: ["reports"] });
			await queryClient.invalidateQueries({ queryKey: ["report", report.id] });
			setError(null);
			onComplete(report);
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
		setProjectIds([]);
	};

	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(e) => {
				e.preventDefault();
				mutation.mutate();
			}}
		>
			<div className="grid gap-5 sm:grid-cols-2">
				<div className="flex flex-col gap-2">
					<Label htmlFor="report-name">{t("reports.name")}</Label>
					<Input
						id="report-name"
						value={effectiveName}
						onChange={(e) => {
							setName(e.target.value);
							setNameEdited(true);
						}}
						required
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label>{t("reports.template")}</Label>
					<Select value={selectedTemplateId} onValueChange={setTemplateId}>
						<SelectTrigger className="w-full">
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

			<div className="flex flex-col gap-2">
				<Label>{t("reports.dateRange")}</Label>
				<Select
					value={rangeChoice}
					onValueChange={(v) => setRangeChoice(v as DateRangePreset | "custom")}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PRESETS.map((preset) => (
							<SelectItem key={preset} value={preset}>
								{t(`reports.range.${preset}`)}
							</SelectItem>
						))}
						<SelectItem value="custom">{t("reports.range.custom")}</SelectItem>
					</SelectContent>
				</Select>
				{rangeChoice !== "custom" && (
					<p className="text-muted-foreground text-xs">
						{t(
							"reports.form.presetPreview",
							resolveDateRange(rangeChoice, anchorTimezone),
						)}
					</p>
				)}
			</div>
			{rangeChoice === "custom" && (
				<div className="grid gap-5 sm:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="report-from">{t("reports.from")}</Label>
						<Input
							id="report-from"
							type="date"
							className="[color-scheme:light] dark:[color-scheme:dark]"
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
							className="[color-scheme:light] dark:[color-scheme:dark]"
							value={to}
							onChange={(e) => setTo(e.target.value)}
							required
						/>
					</div>
				</div>
			)}

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
					className="field-sizing-fixed"
					value={note}
					onChange={(e) => setNote(e.target.value)}
					rows={4}
					placeholder={t("reports.notePlaceholder")}
				/>
			</div>

			{spanTooLong && (
				<p className="text-destructive text-sm">{t("reports.spanTooLong")}</p>
			)}
			{error && <p className="text-destructive text-sm">{error}</p>}
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onCancel}>
					{t("reports.cancelAction")}
				</Button>
				<Button
					type="submit"
					disabled={
						mutation.isPending ||
						workspaceIds.length === 0 ||
						!templatesReady ||
						spanTooLong
					}
				>
					{editingId ? t("reports.saveAction") : t("reports.createAction")}
				</Button>
			</DialogFooter>
		</form>
	);
}
