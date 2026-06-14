import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

function browserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function CreateWorkspaceDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { setCurrentId } = useWorkspace();
	const [slug, setSlug] = useState("");
	const [name, setName] = useState("");
	const [timezone, setTimezone] = useState(browserTimezone);
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () => api.createWorkspace({ slug, name, timezone }),
		onSuccess: async (workspace) => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			setCurrentId(workspace.id);
			setSlug("");
			setName("");
			setError(null);
			onOpenChange(false);
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>{t("settings.createWorkspace.title")}</DialogTitle>
					<DialogDescription>
						{t("settings.createWorkspace.description")}
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-5"
					onSubmit={(e) => {
						e.preventDefault();
						mutation.mutate();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="create-ws-name">
							{t("settings.workspaceName")}
						</Label>
						<Input
							id="create-ws-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="create-ws-slug">{t("settings.slug")}</Label>
						<Input
							id="create-ws-slug"
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							pattern="[a-z0-9][a-z0-9-]*"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="create-ws-tz">{t("settings.timezone")}</Label>
						<Input
							id="create-ws-tz"
							value={timezone}
							onChange={(e) => setTimezone(e.target.value)}
							required
						/>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{t("settings.cancelAction")}
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{t("settings.createAction")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
