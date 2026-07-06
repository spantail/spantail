import {
	isWorkspaceLogoMimeType,
	WORKSPACE_LOGO_MAX_BYTES,
	WORKSPACE_LOGO_MIME_TYPES,
	type WorkspaceWithRole,
} from "@spantail/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ArchiveIcon,
	ArchiveRestoreIcon,
	Trash2Icon,
	TriangleAlertIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppearanceCard } from "@/components/appearance-card";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { api } from "@/lib/api";
import { useSettingsWorkspace } from "@/lib/settings-workspace";

export const Route = createFileRoute("/settings/_workspace/general")({
	component: GeneralSection,
});

function GeneralSection() {
	const { t } = useTranslation();
	const { selected, canManage, canDelete } = useSettingsWorkspace();

	if (!selected) {
		return (
			<p className="text-muted-foreground text-sm">{t("workspace.none")}</p>
		);
	}

	if (!canManage) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.nav.general")}
					</CardTitle>
					<CardDescription>{t("settings.adminOnlyHint")}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="grid gap-4" key={selected.id}>
			<WorkspaceCard workspace={selected} />
			<AppearanceCard workspace={selected} />
			{canDelete && <DangerZoneCard workspace={selected} />}
		</div>
	);
}

// One coherent identity card — logo beside name/slug, a single save — per the
// design mockup. The logo uploads on file pick; save covers the text fields.
function WorkspaceCard({ workspace }: { workspace: WorkspaceWithRole }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const inputRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(workspace.name);
	const [slug, setSlug] = useState(workspace.slug);
	const [error, setError] = useState<string | null>(null);

	const invalidateMe = async () => {
		await queryClient.invalidateQueries({ queryKey: ["me"] });
		setError(null);
	};

	const saveMutation = useMutation({
		mutationFn: () => api.updateWorkspace(workspace.id, { name, slug }),
		onSuccess: invalidateMe,
		onError: (err: Error) => setError(err.message),
	});

	const uploadMutation = useMutation({
		mutationFn: (file: File) => api.uploadWorkspaceLogo(workspace.id, file),
		onSuccess: invalidateMe,
		onError: (err: Error) => setError(err.message),
	});

	const removeMutation = useMutation({
		mutationFn: () => api.removeWorkspaceLogo(workspace.id),
		onSuccess: invalidateMe,
		onError: (err: Error) => setError(err.message),
	});

	function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		if (!isWorkspaceLogoMimeType(file.type)) {
			setError(t("settings.general.logoErrorType"));
			return;
		}
		if (file.size > WORKSPACE_LOGO_MAX_BYTES) {
			setError(t("settings.general.logoErrorSize"));
			return;
		}
		uploadMutation.mutate(file);
	}

	const logoBusy = uploadMutation.isPending || removeMutation.isPending;
	// While archived the workspace is read-only: identity edits are disabled
	// (the server rejects them) and the card offers restore instead.
	const archived = Boolean(workspace.archivedAt);

	const archiveMutation = useMutation({
		mutationFn: () =>
			api.updateWorkspace(workspace.id, { archived: !archived }),
		onSuccess: async () => {
			await invalidateMe();
			toast.success(
				archived
					? t("settings.general.unarchivedToast")
					: t("settings.general.archivedToast"),
			);
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.general.title")}
				</CardTitle>
				<CardDescription>{t("settings.general.description")}</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="flex flex-col gap-5"
					onSubmit={(e) => {
						e.preventDefault();
						saveMutation.mutate();
					}}
				>
					<div className="flex flex-wrap items-start gap-x-8 gap-y-5">
						<div className="flex flex-col gap-2">
							<Label>{t("settings.general.logo")}</Label>
							<div className="flex items-center gap-3">
								<WorkspaceAvatar
									name={workspace.name}
									logoUrl={workspace.logoUrl}
									className="size-14 text-lg"
								/>
								<div className="flex flex-col items-start gap-1.5">
									<input
										ref={inputRef}
										type="file"
										accept={WORKSPACE_LOGO_MIME_TYPES.join(",")}
										className="hidden"
										onChange={onFileChange}
									/>
									<div className="flex gap-2">
										{/* The mockup's small action buttons: h-8 with text-xs. */}
										<Button
											type="button"
											variant="outline"
											className="px-3 text-xs"
											disabled={logoBusy || archived}
											onClick={() => inputRef.current?.click()}
										>
											{t("settings.general.logoUpload")}
										</Button>
										{workspace.logoUrl && (
											<Button
												type="button"
												variant="ghost"
												className="px-3 text-xs"
												disabled={logoBusy || archived}
												onClick={() => removeMutation.mutate()}
											>
												{t("settings.general.logoRemove")}
											</Button>
										)}
									</div>
									<p className="text-muted-foreground text-xs">
										{t("settings.general.logoHint")}
									</p>
								</div>
							</div>
						</div>
						{/* Sized by available width (not viewport breakpoints), so the pane
						    can narrow without the fields collapsing: the block wraps under
						    the logo, and the columns stack below ~2×240px. */}
						<div
							className="grid min-w-0 flex-1 basis-80 gap-5"
							style={{
								gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
							}}
						>
							<div className="flex flex-col gap-2">
								<Label htmlFor="edit-ws-name">
									{t("settings.workspaceName")}
								</Label>
								<Input
									id="edit-ws-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									disabled={archived}
									required
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="edit-ws-slug">{t("settings.slug")}</Label>
								<Input
									id="edit-ws-slug"
									value={slug}
									onChange={(e) => setSlug(e.target.value)}
									pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
									maxLength={50}
									disabled={archived}
									required
								/>
							</div>
						</div>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div>
						<Button type="submit" disabled={saveMutation.isPending || archived}>
							{t("settings.general.save")}
						</Button>
					</div>
					<div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-5">
						<div className="min-w-0">
							<p className="text-sm font-medium">
								{t("settings.general.archiveLabel")}
							</p>
							<p className="text-muted-foreground mt-0.5 text-sm">
								{archived
									? t("settings.general.archivedHint")
									: t("settings.general.archiveDescription")}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							disabled={archiveMutation.isPending}
							onClick={() => archiveMutation.mutate()}
						>
							{archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
							{archived
								? t("settings.general.unarchiveAction")
								: t("settings.general.archiveAction")}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

// Owner-only (or instance admin): deleting a workspace destroys its projects,
// entries, and agent activity, so it sits apart from the identity card and
// gates the action behind a typed slug confirmation.
function DangerZoneCard({ workspace }: { workspace: WorkspaceWithRole }) {
	const { t } = useTranslation();
	const [deleteOpen, setDeleteOpen] = useState(false);

	return (
		<Card className="border-destructive/40">
			<CardHeader>
				<CardTitle className="font-heading text-destructive text-base">
					{t("settings.danger.title")}
				</CardTitle>
				<CardDescription>{t("settings.danger.description")}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="min-w-0">
						<p className="text-sm font-medium">
							{t("settings.danger.deleteLabel")}
						</p>
						<p className="text-muted-foreground mt-0.5 text-sm">
							{t("settings.danger.deleteDescription")}
						</p>
					</div>
					<Button variant="destructive" onClick={() => setDeleteOpen(true)}>
						<Trash2Icon />
						{t("settings.danger.deleteAction")}
					</Button>
				</div>
				<DeleteWorkspaceDialog
					workspace={workspace}
					open={deleteOpen}
					onOpenChange={setDeleteOpen}
				/>
			</CardContent>
		</Card>
	);
}

function DeleteWorkspaceDialog({
	workspace,
	open,
	onOpenChange,
}: {
	workspace: WorkspaceWithRole;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [confirmText, setConfirmText] = useState("");
	const confirmed = confirmText === workspace.slug;

	const close = (next: boolean) => {
		if (!next) setConfirmText("");
		onOpenChange(next);
	};

	const mutation = useMutation({
		mutationFn: () => api.deleteWorkspace(workspace.id),
		onSuccess: async () => {
			// Both the settings selection and the active workspace self-heal once
			// the membership disappears from ["me"], so no explicit reset is needed.
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			close(false);
			toast.success(t("settings.danger.deletedToast"));
		},
		onError: (err: Error) => toast.error(err.message),
	});

	return (
		<AlertDialog open={open} onOpenChange={close}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("settings.danger.deleteTitle", { name: workspace.name })}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("settings.danger.deleteDialogDescription")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="border-destructive/30 bg-destructive/10 flex gap-3 rounded-xl border p-4">
					<span className="bg-destructive/15 text-destructive mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full">
						<TriangleAlertIcon className="size-[18px]" />
					</span>
					<div className="min-w-0 text-sm">
						<p className="text-destructive font-semibold">
							{t("settings.danger.deleteWarningTitle")}
						</p>
						<p className="text-destructive/80 mt-1 leading-relaxed">
							{t("settings.danger.deleteWarningBody", {
								name: workspace.name,
							})}
						</p>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="delete-ws-confirm">
						{t("settings.danger.confirmLabel", { slug: workspace.slug })}
					</Label>
					<Input
						id="delete-ws-confirm"
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
						placeholder={workspace.slug}
						autoComplete="off"
					/>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("settings.cancelAction")}</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: "destructive" })}
						disabled={!confirmed || mutation.isPending}
						onClick={(e) => {
							e.preventDefault();
							mutation.mutate();
						}}
					>
						<Trash2Icon />
						{t("settings.danger.deleteConfirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
