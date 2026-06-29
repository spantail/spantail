import {
	type CreateReportInput,
	type DateRangePreset,
	formatDuration,
	formatPeriodLabel,
	MAX_REPORT_SPAN_DAYS,
	type Report,
	type ReportFiltersInput,
	type ReportTemplate,
	resolveDateRange,
} from "@spantail/core";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { FileTextIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { api } from "@/lib/api";
import { invalidateReports } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

const PRESETS: DateRangePreset[] = [
	"today",
	"yesterday",
	"this_week",
	"last_week",
	"this_month",
	"last_month",
];

/** Initial field values; the route seeds these for create/edit. */
export interface ReportFormSeed {
	name: string;
	/** When false, the name auto-updates from period + user name until edited. */
	nameEdited: boolean;
	templateId: string;
	// Single workspace scope: an id selects one workspace; null means instance
	// scope (every workspace the running user belongs to).
	workspaceId: string | null;
	projectIds: string[];
	// Preserved across an edit even though there is no UI field for it, so a
	// user-scoped report (e.g. a personal daily) keeps its scope instead of
	// silently broadening to every member of the workspace.
	userIds: string[];
	rangeChoice: DateRangePreset | "custom";
	from: string;
	to: string;
	tags: string;
	note: string;
}

export type ReportFormMode = "create" | "edit";

function spanDays(from: string, to: string): number {
	const utcMs = (date: string) => {
		const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
		return Date.UTC(y, m - 1, d);
	};
	return (utcMs(to) - utcMs(from)) / 86_400_000 + 1;
}

/** Debounces a value so the live preview doesn't refetch on every keystroke. */
function useDebouncedValue<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(id);
	}, [value, ms]);
	return debounced;
}

/**
 * Two-pane report compose dialog: filters/fields on the left, a live Markdown
 * preview on the right. Submitting renders the report server-side — create mints
 * version 1, edit re-renders and appends the next version. Both share one input
 * shape, so the same form backs create and edit.
 */
export function ReportForm({
	mode,
	reportId,
	title,
	templates,
	templatesReady,
	seed,
	onComplete,
	onCancel,
}: {
	mode: ReportFormMode;
	/** Required for edit: the report whose new version this save appends. */
	reportId?: string;
	title: string;
	templates: ReportTemplate[];
	templatesReady: boolean;
	seed: ReportFormSeed;
	/** Called after save with the rendered report so the viewer can open. */
	onComplete: (report: Report) => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { workspaces } = useWorkspace();
	const timezone = useUserTimezone();
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
	const userName = me.data?.user.name ?? "";

	// Report scope is membership-only (the server validates against
	// listWorkspacesForUser), so an instance admin's non-member workspaces
	// (role === null) must not be selectable or treated as membership.
	const memberWorkspaces = workspaces.filter((w) => w.role !== null);
	const memberIds = new Set(memberWorkspaces.map((w) => w.id));
	// A seeded workspace the user no longer belongs to drops to instance scope.
	const seededWorkspaceId =
		seed.workspaceId && memberIds.has(seed.workspaceId)
			? seed.workspaceId
			: null;
	// True when the seeded workspace selection survived (still a member, or it was
	// already instance scope). When it didn't, the carried-over user filter no
	// longer matches the scope and is dropped.
	const filtersIntact = seededWorkspaceId === seed.workspaceId;
	// Projects only apply to a single workspace. Keep the seeded project filter
	// only for an intact single-workspace scope — never for instance scope (the
	// API rejects projects without a workspace, which would block save), and never
	// when the workspace was dropped (it would be a hidden, empty-rendering filter).
	const projectsIntact = filtersIntact && seededWorkspaceId !== null;

	const [name, setName] = useState(seed.name);
	const [nameEdited, setNameEdited] = useState(seed.nameEdited);
	const [templateId, setTemplateId] = useState(seed.templateId);
	const [workspaceId, setWorkspaceId] = useState<string | null>(
		seededWorkspaceId,
	);
	const [projectIds, setProjectIds] = useState<string[]>(
		projectsIntact ? seed.projectIds : [],
	);
	// No UI field: carried through edit as-is (dropped only if the workspace set
	// changes, alongside projects).
	const [userIds, setUserIds] = useState<string[]>(
		filtersIntact ? seed.userIds : [],
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
			: // Selection no longer available (e.g. its template was deleted): switch
				// to the first enabled template, or keep the current id when none exist
				// rather than blanking it into an invalid request.
				(availableTemplates[0]?.id ?? templateId);

	const projects = useQuery({
		queryKey: ["projects", workspaceId],
		queryFn: () => api.listProjects(workspaceId ?? ""),
		enabled: Boolean(workspaceId),
	});

	const customValid =
		rangeChoice !== "custom" || (from !== "" && to !== "" && from <= to);
	const resolvedLabel =
		rangeChoice === "custom"
			? customValid && from !== "" && to !== ""
				? formatPeriodLabel({ from, to })
				: null
			: formatPeriodLabel(resolveDateRange(rangeChoice, timezone));
	const workspaceName = workspaceId
		? (memberWorkspaces.find((w) => w.id === workspaceId)?.name ?? "")
		: "";
	const autoName = resolvedLabel
		? [workspaceName, userName, resolvedLabel].filter(Boolean).join(" ")
		: "";
	const effectiveName = nameEdited ? name : autoName;
	const spanTooLong =
		rangeChoice === "custom" &&
		from !== "" &&
		to !== "" &&
		from <= to &&
		spanDays(from, to) > MAX_REPORT_SPAN_DAYS;

	// The request body shared by the live preview and the submit. Null while the
	// form can't render (invalid/too-long range or blank name) so the preview
	// holds its last good output instead of erroring. An empty workspace is valid
	// — it means instance scope (all the user's workspaces) — but only when the
	// user belongs to at least one workspace; otherwise every render would 400.
	const input = useMemo<CreateReportInput | null>(() => {
		if (memberWorkspaces.length === 0) return null;
		if (!customValid || spanTooLong) return null;
		if (effectiveName.trim() === "") return null;
		const parsedTags = tags
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);
		// projectIds is only ever set while a single workspace is selected (its
		// checkboxes are cleared when the workspace changes), so it is dropped
		// automatically for instance scope.
		const filters: ReportFiltersInput = {
			workspaceIds: workspaceId ? [workspaceId] : [],
			...(projectIds.length > 0 ? { projectIds } : {}),
			...(userIds.length > 0 ? { userIds } : {}),
			...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
			dateRange: rangeChoice === "custom" ? { from, to } : rangeChoice,
		};
		return {
			name: effectiveName,
			templateId: selectedTemplateId,
			filters,
			...(note.trim() !== "" ? { note } : {}),
		};
	}, [
		workspaceId,
		memberWorkspaces.length,
		customValid,
		spanTooLong,
		effectiveName,
		tags,
		projectIds,
		userIds,
		rangeChoice,
		from,
		to,
		note,
		selectedTemplateId,
	]);

	const inputKey = input ? JSON.stringify(input) : null;
	const debouncedKey = useDebouncedValue(inputKey, 350);
	const preview = useQuery({
		queryKey: ["report-preview", debouncedKey],
		queryFn: () => api.previewReport(JSON.parse(debouncedKey as string)),
		enabled: debouncedKey !== null,
		placeholderData: keepPreviousData,
	});
	// "Updating" while the debounce is pending or a render is in flight.
	const previewPending =
		inputKey !== debouncedKey || (preview.isFetching && debouncedKey !== null);

	const mutation = useMutation({
		mutationFn: async (): Promise<Report> => {
			if (!input) throw new Error("Report is not ready to save");
			return mode === "edit" && reportId
				? api.updateReport(reportId, input)
				: api.createReport(input);
		},
		onSuccess: async (report) => {
			invalidateReports(queryClient);
			queryClient.setQueryData(["report", report.id], report);
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
	// The Select uses a sentinel value for instance scope, since an empty string
	// is not a valid SelectItem value.
	const INSTANCE_SCOPE = "__all__";
	const changeWorkspace = (value: string) => {
		setWorkspaceId(value === INSTANCE_SCOPE ? null : value);
		// Project and user scopes belong to the old workspace; clear both.
		setProjectIds([]);
		setUserIds([]);
	};

	// Draggable divider between the form and the preview (percent width).
	const bodyRef = useRef<HTMLDivElement>(null);
	const [formW, setFormW] = useState(48);
	const startDrag = (ev: React.PointerEvent) => {
		ev.preventDefault();
		const rect = bodyRef.current?.getBoundingClientRect();
		if (!rect) return;
		const move = (e: PointerEvent) => {
			const pct = ((e.clientX - rect.left) / rect.width) * 100;
			setFormW(Math.min(64, Math.max(30, pct)));
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
	};

	const submitLabel =
		mode === "edit" ? t("reports.saveAction") : t("reports.createAction");
	const canSubmit = input !== null && templatesReady && !mutation.isPending;

	return (
		<>
			<DialogHeader className="shrink-0 border-b px-7 py-5">
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{t("reports.composeDescription")}</DialogDescription>
			</DialogHeader>

			<div ref={bodyRef} className="flex min-h-0 flex-1">
				<div
					className="min-h-0 overflow-y-auto px-7 py-6"
					style={{ width: `${formW}%` }}
				>
					<form
						id="report-compose-form"
						className="flex flex-col gap-5"
						onSubmit={(e) => {
							e.preventDefault();
							if (canSubmit) mutation.mutate();
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
								<Select
									value={selectedTemplateId}
									onValueChange={setTemplateId}
								>
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

						{memberWorkspaces.length > 0 && (
							<div className="flex flex-col gap-2">
								<Label>{t("reports.workspace")}</Label>
								<Select
									value={workspaceId ?? INSTANCE_SCOPE}
									onValueChange={changeWorkspace}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={INSTANCE_SCOPE}>
											{t("reports.allWorkspaces")}
										</SelectItem>
										{memberWorkspaces.map((workspace) => (
											<SelectItem key={workspace.id} value={workspace.id}>
												{workspace.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						<div className="flex flex-col gap-2">
							<Label>{t("reports.dateRange")}</Label>
							<Select
								value={rangeChoice}
								onValueChange={(v) =>
									setRangeChoice(v as DateRangePreset | "custom")
								}
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
									<SelectItem value="custom">
										{t("reports.range.custom")}
									</SelectItem>
								</SelectContent>
							</Select>
							{rangeChoice !== "custom" && (
								<p className="text-muted-foreground text-xs">
									{t(
										"reports.form.presetPreview",
										resolveDateRange(rangeChoice, timezone),
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

						{workspaceId && (projects.data?.length ?? 0) > 0 && (
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
							<p className="text-destructive text-sm">
								{t("reports.spanTooLong")}
							</p>
						)}
						{error && <p className="text-destructive text-sm">{error}</p>}
					</form>
				</div>

				{/* Pointer-only resize handle; keyboard users keep the default split. */}
				<button
					type="button"
					onPointerDown={startDrag}
					aria-label={t("reports.preview.resize")}
					className="bg-border group relative z-10 w-px shrink-0 cursor-col-resize border-0 p-0"
				>
					<span className="absolute inset-y-0 -left-2 -right-2" />
					<span className="bg-muted-foreground/30 absolute top-1/2 left-1/2 h-9 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
				</button>

				<div className="bg-background relative flex min-h-0 flex-1 flex-col">
					<div className="min-h-0 flex-1 overflow-y-auto">
						<div className="mx-auto w-full max-w-2xl px-9 py-9">
							{preview.data ? (
								<MarkdownView
									markdown={preview.data.content}
									variant="report"
								/>
							) : (
								<p className="text-muted-foreground text-sm">
									{t("reports.preview.invalid")}
								</p>
							)}
						</div>
					</div>
					{previewPending && (
						<span className="bg-muted text-muted-foreground absolute right-4 top-4 z-10 rounded-md px-2 py-1 text-xs">
							{t("reports.preview.updating")}
						</span>
					)}
				</div>
			</div>

			<div className="bg-muted/40 flex shrink-0 items-center justify-between gap-3 border-t px-7 py-4">
				<span className="text-muted-foreground truncate text-xs">
					{preview.data
						? t("reports.preview.summary", {
								entries: preview.data.entryCount,
								total: formatDuration(preview.data.totalMinutes),
								projects: preview.data.projectCount,
							})
						: ""}
				</span>
				<div className="flex items-center gap-2">
					<Button type="button" variant="outline" onClick={onCancel}>
						{t("reports.cancelAction")}
					</Button>
					<Button
						type="submit"
						form="report-compose-form"
						disabled={!canSubmit}
					>
						<FileTextIcon className={cn(mode === "edit" && "hidden")} />
						{submitLabel}
					</Button>
				</div>
			</div>
		</>
	);
}
