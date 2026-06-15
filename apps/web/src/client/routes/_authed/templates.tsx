import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { PeriodUnit, ReportTemplate } from "@toxil/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { useWorkspace } from "@/lib/workspace";

const PERIOD_UNITS: PeriodUnit[] = ["day", "week", "month", "custom"];

export const Route = createFileRoute("/_authed/templates")({
	component: TemplatesPage,
});

interface TemplateDraft {
	editingId: string | null;
	name: string;
	description: string;
	body: string;
	periodUnit: PeriodUnit;
}

const EMPTY_DRAFT: TemplateDraft = {
	editingId: null,
	name: "",
	description: "",
	body: "",
	periodUnit: "custom",
};

function TemplatesPage() {
	const { t } = useTranslation();
	const { current } = useWorkspace();

	if (!current) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	// Keyed by workspace so a sidebar switch drops any in-progress draft
	// instead of saving it into the newly selected workspace.
	return <TemplatesContent key={current.id} workspaceId={current.id} />;
}

function TemplatesContent({ workspaceId }: { workspaceId: string }) {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
	const isAdmin = current?.role === "admin" || current?.role === "owner";

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<h1 className="font-heading text-lg font-semibold">
				{t("templates.title")}
			</h1>
			{isAdmin ? (
				<TemplateFormCard
					workspaceId={workspaceId}
					draft={draft}
					onDraftChange={setDraft}
				/>
			) : (
				<p className="text-muted-foreground text-sm">
					{t("templates.adminOnlyHint")}
				</p>
			)}
			<TemplateListCard
				workspaceId={workspaceId}
				isAdmin={isAdmin}
				onEdit={(template) =>
					setDraft({
						editingId: template.id,
						name: template.name,
						description: template.description ?? "",
						body: template.body,
						periodUnit: template.periodUnit,
					})
				}
				onDuplicate={(template) =>
					setDraft({
						editingId: null,
						name: t("templates.copyName", { name: template.name }),
						description: template.description ?? "",
						body: template.body,
						periodUnit: template.periodUnit,
					})
				}
			/>
		</div>
	);
}

function TemplateFormCard({
	workspaceId,
	draft,
	onDraftChange,
}: {
	workspaceId: string;
	draft: TemplateDraft;
	onDraftChange: (draft: TemplateDraft) => void;
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
			};
			if (draft.editingId) {
				const updated = await api.updateReportTemplate(draft.editingId, input);
				// Cadence is template state, set via the separate admin route.
				await api.updateReportTemplateState(workspaceId, draft.editingId, {
					periodUnit: draft.periodUnit,
				});
				return updated;
			}
			return api.createReportTemplate(workspaceId, {
				...input,
				description: input.description ?? undefined,
				periodUnit: draft.periodUnit,
			});
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["report-templates", workspaceId],
			});
			onDraftChange(EMPTY_DRAFT);
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
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
						<Label>{t("templates.periodUnit")}</Label>
						<Select
							value={draft.periodUnit}
							onValueChange={(v) =>
								onDraftChange({ ...draft, periodUnit: v as PeriodUnit })
							}
						>
							<SelectTrigger className="w-full sm:w-1/2">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PERIOD_UNITS.map((unit) => (
									<SelectItem key={unit} value={unit}>
										{t(`templates.cadence.${unit}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div className="flex gap-2">
						<Button type="submit" disabled={mutation.isPending}>
							{editing
								? t("templates.saveAction")
								: t("templates.createAction")}
						</Button>
						{editing && (
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									onDraftChange(EMPTY_DRAFT);
									setError(null);
								}}
							>
								{t("templates.cancelAction")}
							</Button>
						)}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

function TemplateListCard({
	workspaceId,
	isAdmin,
	onEdit,
	onDuplicate,
}: {
	workspaceId: string;
	isAdmin: boolean;
	onEdit: (template: ReportTemplate) => void;
	onDuplicate: (template: ReportTemplate) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);

	const templates = useQuery({
		queryKey: ["report-templates", workspaceId],
		queryFn: () => api.listReportTemplates(workspaceId),
	});

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: ["report-templates", workspaceId],
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
			api.updateReportTemplateState(workspaceId, id, { enabled }),
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
					{t("templates.listTitle")}
				</CardTitle>
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
								<TableHead>{t("templates.periodUnit")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((template) => (
								<TableRow key={template.id}>
									<TableCell>
										<span className="flex flex-wrap items-center gap-2">
											{template.name}
											{template.builtin && (
												<Badge variant="secondary">
													{t("templates.builtin")}
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
										{t(`templates.cadence.${template.periodUnit}`)}
									</TableCell>
									<TableCell className="text-right">
										{isAdmin && (
											<>
												<Button
													variant="ghost"
													size="sm"
													disabled={enabledMutation.isPending}
													onClick={() =>
														enabledMutation.mutate({
															id: template.id,
															enabled: !template.enabled,
														})
													}
												>
													{template.enabled
														? t("templates.disableAction")
														: t("templates.enableAction")}
												</Button>
												{template.builtin ? (
													<Button
														variant="ghost"
														size="sm"
														onClick={() => onDuplicate(template)}
													>
														{t("templates.duplicateAction")}
													</Button>
												) : (
													<>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => onEdit(template)}
														>
															{t("templates.editAction")}
														</Button>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => deleteMutation.mutate(template.id)}
														>
															{t("templates.deleteAction")}
														</Button>
													</>
												)}
											</>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
