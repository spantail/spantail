import {
	isWorkspaceLogoMimeType,
	WORKSPACE_LOGO_MAX_BYTES,
	WORKSPACE_LOGO_MIME_TYPES,
	type WorkspaceWithRole,
} from "@spantail/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppearanceCard } from "@/components/appearance-card";
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
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { api } from "@/lib/api";
import { useSettingsWorkspace } from "@/lib/settings-workspace";

export const Route = createFileRoute("/settings/_workspace/general")({
	component: GeneralSection,
});

function GeneralSection() {
	const { t } = useTranslation();
	const { selected, canManage } = useSettingsWorkspace();

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
										<Button
											type="button"
											variant="outline"
											disabled={logoBusy}
											onClick={() => inputRef.current?.click()}
										>
											{t("settings.general.logoUpload")}
										</Button>
										{workspace.logoUrl && (
											<Button
												type="button"
												variant="ghost"
												disabled={logoBusy}
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
									required
								/>
							</div>
						</div>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div>
						<Button type="submit" disabled={saveMutation.isPending}>
							{t("settings.general.save")}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
