import type { Workspace } from "@spantail/core";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

/**
 * The workspace name + slug fields and their create mutation, shared by the
 * "Create workspace" dialog and the onboarding wizard. The two differ only in
 * what happens after creation and how the actions are laid out, so the caller
 * supplies `onCreated` and, optionally, custom action buttons via `renderFooter`
 * (the dialog renders them inside a DialogFooter; the wizard uses the default
 * single submit button). #105 removed timezone from workspaces — it is a
 * per-user setting now — so this collects name and slug only.
 */
export function WorkspaceForm({
	onCreated,
	submitLabel,
	idPrefix = "ws",
	renderFooter,
}: {
	onCreated: (workspace: Workspace) => void | Promise<void>;
	submitLabel?: string;
	idPrefix?: string;
	renderFooter?: (state: { pending: boolean }) => React.ReactNode;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () => api.createWorkspace({ slug, name }),
		onSuccess: async (workspace) => {
			setError(null);
			await onCreated(workspace);
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(e) => {
				e.preventDefault();
				mutation.mutate();
			}}
		>
			<div className="flex flex-col gap-2">
				<Label htmlFor={`${idPrefix}-name`}>
					{t("settings.workspaceName")}
				</Label>
				<Input
					id={`${idPrefix}-name`}
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor={`${idPrefix}-slug`}>{t("settings.slug")}</Label>
				<Input
					id={`${idPrefix}-slug`}
					value={slug}
					onChange={(e) => setSlug(e.target.value)}
					pattern="[a-z0-9][a-z0-9-]*"
					required
				/>
			</div>
			{error && <p className="text-destructive text-sm">{error}</p>}
			{renderFooter ? (
				renderFooter({ pending: mutation.isPending })
			) : (
				<div>
					<Button type="submit" disabled={mutation.isPending}>
						{submitLabel}
					</Button>
				</div>
			)}
		</form>
	);
}
