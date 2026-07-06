import type { DateRangePreset, ReportTemplate } from "@spantail/core";
import { dateRangePresetSchema } from "@spantail/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	CopyIcon,
	EyeIcon,
	EyeOffIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	StarIcon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingsSection } from "@/components/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

export const Route = createFileRoute("/settings/templates")({
	component: TemplatesSection,
});

// Sentinel for the "not set" option: a Radix SelectItem cannot use an empty
// string value, and null is the wire/draft representation of an unset default.
const DATE_RANGE_NONE = "__none__";

interface TemplateDraft {
	editingId: string | null;
	name: string;
	description: string;
	body: string;
	nameTemplate: string;
	noteTemplate: string;
	defaultDateRange: DateRangePreset | null;
}

const EMPTY_DRAFT: TemplateDraft = {
	editingId: null,
	name: "",
	description: "",
	body: "",
	nameTemplate: "",
	noteTemplate: "",
	defaultDateRange: null,
};

function draftFrom(template: ReportTemplate, editing: boolean): TemplateDraft {
	return {
		editingId: editing ? template.id : null,
		name: template.name,
		description: template.description ?? "",
		body: template.body,
		nameTemplate: template.nameTemplate ?? "",
		noteTemplate: template.noteTemplate ?? "",
		defaultDateRange: template.defaultDateRange,
	};
}

function TemplatesSection() {
	const { t } = useTranslation();
	return (
		<SettingsSection title={t("settings.nav.templates")}>
			<TemplatesContent />
		</SettingsSection>
	);
}

// The list and the editor are two views of the same pane (the editor is not a
// dialog — the body textarea needs room), per the design mockup.
function TemplatesContent() {
	const { t } = useTranslation();
	const [draft, setDraft] = useState<TemplateDraft | null>(null);
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

	if (me.isPending) {
		return <p className="text-muted-foreground text-sm">{t("app.loading")}</p>;
	}
	// Templates are instance-scoped formats: instance admins and users granted
	// the template-author capability may manage them.
	const canManage =
		(me.data?.user.isAdmin ?? false) ||
		(me.data?.user.canManageTemplates ?? false);

	if (canManage && draft) {
		return (
			<TemplateEditor
				draft={draft}
				onDraftChange={setDraft}
				onClose={() => setDraft(null)}
			/>
		);
	}

	return (
		<TemplateListCard
			canManage={canManage}
			onCreate={() => setDraft(EMPTY_DRAFT)}
			onEdit={(template) => setDraft(draftFrom(template, true))}
			onDuplicate={(template) =>
				setDraft({
					...draftFrom(template, false),
					name: t("templates.copyName", { name: template.name }),
				})
			}
		/>
	);
}

function TemplateEditor({
	draft,
	onDraftChange,
	onClose,
}: {
	draft: TemplateDraft;
	onDraftChange: (draft: TemplateDraft) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const editing = draft.editingId !== null;

	const mutation = useMutation({
		mutationFn: async () => {
			const input = {
				name: draft.name,
				description: draft.description.trim() === "" ? null : draft.description,
				body: draft.body,
				nameTemplate:
					draft.nameTemplate.trim() === "" ? null : draft.nameTemplate,
				noteTemplate:
					draft.noteTemplate.trim() === "" ? null : draft.noteTemplate,
				defaultDateRange: draft.defaultDateRange,
			};
			if (draft.editingId) {
				return api.updateReportTemplate(draft.editingId, input);
			}
			return api.createReportTemplate({
				...input,
				description: input.description ?? undefined,
				nameTemplate: input.nameTemplate ?? undefined,
				noteTemplate: input.noteTemplate ?? undefined,
			});
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["report-templates"],
			});
			onClose();
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<div className="flex flex-col gap-3">
			<button
				type="button"
				onClick={onClose}
				className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors"
			>
				<ArrowLeftIcon className="size-4" />
				{t("templates.backAction")}
			</button>
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{editing ? t("templates.editTitle") : t("templates.newTitle")}
					</CardTitle>
					<CardDescription>{t("templates.bodyHint")}</CardDescription>
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
								<Label htmlFor="tpl-name">{t("templates.name")}</Label>
								<Input
									id="tpl-name"
									value={draft.name}
									onChange={(e) =>
										onDraftChange({ ...draft, name: e.target.value })
									}
									required
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="tpl-description">
									{t("templates.description")}
								</Label>
								<Input
									id="tpl-description"
									value={draft.description}
									onChange={(e) =>
										onDraftChange({ ...draft, description: e.target.value })
									}
								/>
							</div>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="tpl-body">{t("templates.body")}</Label>
							<Textarea
								id="tpl-body"
								value={draft.body}
								onChange={(e) =>
									onDraftChange({ ...draft, body: e.target.value })
								}
								rows={12}
								className="font-mono text-sm"
								required
							/>
						</div>
						{/* Composer defaults — what a new report starts with when it is
						    composed from this template. */}
						<div className="border-border mt-1 border-t pt-4">
							<p className="text-sm font-semibold">
								{t("templates.composerDefaultsTitle")}
							</p>
							<p className="text-muted-foreground mt-0.5 text-sm">
								{t("templates.composerDefaultsHint")}
							</p>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="tpl-name-template">
								{t("templates.nameTemplate")}
							</Label>
							<Input
								id="tpl-name-template"
								value={draft.nameTemplate}
								onChange={(e) =>
									onDraftChange({ ...draft, nameTemplate: e.target.value })
								}
								className="font-mono text-sm"
							/>
							<p className="text-muted-foreground text-sm">
								{t("templates.nameTemplateHint")}
							</p>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="tpl-note-template">
								{t("templates.noteTemplate")}
							</Label>
							<Textarea
								id="tpl-note-template"
								value={draft.noteTemplate}
								onChange={(e) =>
									onDraftChange({ ...draft, noteTemplate: e.target.value })
								}
								rows={3}
								className="font-mono text-sm"
							/>
							<p className="text-muted-foreground text-sm">
								{t("templates.noteTemplateHint")}
							</p>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="tpl-default-date-range">
								{t("templates.defaultDateRange")}
							</Label>
							<Select
								value={draft.defaultDateRange ?? DATE_RANGE_NONE}
								onValueChange={(value) =>
									onDraftChange({
										...draft,
										defaultDateRange:
											value === DATE_RANGE_NONE
												? null
												: (value as DateRangePreset),
									})
								}
							>
								<SelectTrigger id="tpl-default-date-range" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={DATE_RANGE_NONE}>
										{t("templates.defaultDateRangeNone")}
									</SelectItem>
									{dateRangePresetSchema.options.map((preset) => (
										<SelectItem key={preset} value={preset}>
											{t(`reports.range.${preset}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-muted-foreground text-sm">
								{t("templates.defaultDateRangeHint")}
							</p>
						</div>
						{error && <p className="text-destructive text-sm">{error}</p>}
						<div className="border-border flex gap-2 border-t pt-4">
							<Button type="submit" disabled={mutation.isPending}>
								{editing
									? t("templates.saveAction")
									: t("templates.createAction")}
							</Button>
							<Button type="button" variant="outline" onClick={onClose}>
								{t("templates.cancelAction")}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

function TemplateListCard({
	canManage,
	onCreate,
	onEdit,
	onDuplicate,
}: {
	canManage: boolean;
	onCreate: () => void;
	onEdit: (template: ReportTemplate) => void;
	onDuplicate: (template: ReportTemplate) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);

	const templates = useQuery({
		queryKey: ["report-templates"],
		queryFn: () => api.listReportTemplates(),
	});

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: ["report-templates"],
		});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteReportTemplate(id),
		onSuccess: async () => {
			await invalidate();
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const enabledMutation = useMutation({
		mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
			api.updateReportTemplateState(id, { enabled }),
		onSuccess: async () => {
			await invalidate();
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const defaultMutation = useMutation({
		mutationFn: (id: string) => api.setDefaultReportTemplate(id),
		onSuccess: async () => {
			await invalidate();
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	const rows = templates.data ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.nav.templates")}
				</CardTitle>
				<CardDescription>
					{canManage
						? t("templates.listDescription")
						: t("templates.managerOnlyHint")}
				</CardDescription>
				{canManage && (
					<CardAction>
						{/* The mockup's small action button: h-8 with text-xs. */}
						<Button className="gap-1.5 px-3 text-xs" onClick={onCreate}>
							<PlusIcon className="size-3.5" />
							{t("templates.newAction")}
						</Button>
					</CardAction>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{error && <p className="text-destructive text-sm">{error}</p>}
				{rows.length === 0 && !templates.isPending ? (
					<p className="text-muted-foreground text-sm">
						{t("templates.empty")}
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("templates.name")}</TableHead>
								<TableHead>{t("templates.defaultDateRange")}</TableHead>
								{canManage && <TableHead />}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((template) => (
								<TableRow
									key={template.id}
									className={template.enabled ? "" : "opacity-60"}
								>
									<TableCell>
										<span className="flex flex-wrap items-center gap-2">
											{template.name}
											{template.isDefault && (
												<Badge variant="secondary">
													{t("templates.defaultBadge")}
												</Badge>
											)}
											{!template.enabled && (
												<Badge variant="outline">
													{t("templates.disabledBadge")}
												</Badge>
											)}
										</span>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{template.defaultDateRange
											? t(`reports.range.${template.defaultDateRange}`)
											: t("templates.defaultDateRangeNone")}
									</TableCell>
									{canManage && (
										<TableCell className="text-right">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="text-muted-foreground size-8"
														aria-label={t("templates.actions")}
													>
														<MoreHorizontalIcon />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end" className="w-48">
													<DropdownMenuItem onClick={() => onEdit(template)}>
														<PencilIcon />
														{t("templates.editAction")}
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => onDuplicate(template)}
													>
														<CopyIcon />
														{t("templates.duplicateAction")}
													</DropdownMenuItem>
													{!template.isDefault && (
														<DropdownMenuItem
															disabled={
																!template.enabled || defaultMutation.isPending
															}
															onClick={() =>
																defaultMutation.mutate(template.id)
															}
														>
															<StarIcon />
															{t("templates.setDefaultAction")}
														</DropdownMenuItem>
													)}
													{!template.isDefault && (
														<DropdownMenuItem
															disabled={enabledMutation.isPending}
															onClick={() =>
																enabledMutation.mutate({
																	id: template.id,
																	enabled: !template.enabled,
																})
															}
														>
															{template.enabled ? <EyeOffIcon /> : <EyeIcon />}
															{template.enabled
																? t("templates.disableAction")
																: t("templates.enableAction")}
														</DropdownMenuItem>
													)}
													<DropdownMenuSeparator />
													{/* The default template can't be deleted. */}
													<DropdownMenuItem
														variant="destructive"
														disabled={template.isDefault}
														onClick={() => deleteMutation.mutate(template.id)}
													>
														<Trash2Icon />
														{t("templates.deleteAction")}
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
