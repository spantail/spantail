import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/settings/general")({
	component: GeneralSection,
});

function GeneralSection() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const canManage = current?.role === "owner" || current?.role === "admin";

	if (!current) {
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

	return <EditWorkspaceCard key={current.id} />;
}

function EditWorkspaceCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { current } = useWorkspace();
	const [name, setName] = useState(current?.name ?? "");
	const [slug, setSlug] = useState(current?.slug ?? "");
	const [timezone, setTimezone] = useState(current?.timezone ?? "");
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () => {
			if (!current) throw new Error("no workspace");
			return api.updateWorkspace(current.id, { name, slug, timezone });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.editWorkspace.title", { name: current?.name })}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4 sm:grid-cols-2"
					onSubmit={(e) => {
						e.preventDefault();
						mutation.mutate();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-ws-name">{t("settings.workspaceName")}</Label>
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
					<div className="flex flex-col gap-2">
						<Label htmlFor="edit-ws-tz">{t("settings.timezone")}</Label>
						<Input
							id="edit-ws-tz"
							value={timezone}
							onChange={(e) => setTimezone(e.target.value)}
							required
						/>
					</div>
					{error && (
						<p className="text-destructive text-sm sm:col-span-2">{error}</p>
					)}
					<div className="sm:col-span-2">
						<Button type="submit" disabled={mutation.isPending}>
							{t("settings.saveAction")}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
