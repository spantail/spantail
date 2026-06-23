import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminBanner } from "@/components/admin-banner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_authed/settings/agents-admin")({
	component: AgentsAdminSection,
});

function AgentsAdminSection() {
	const { t } = useTranslation();
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

	if (me.isPending) {
		return <p className="text-muted-foreground text-sm">{t("app.loading")}</p>;
	}
	if (!me.data?.user.isAdmin) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.agentsAdmin.title")}
					</CardTitle>
					<CardDescription>{t("settings.systemAdminOnly")}</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	return <AgentsAdminCard />;
}

function AgentsAdminCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	const settings = useQuery({
		queryKey: ["agents-enabled"],
		queryFn: () => api.getAgentsEnabled(),
	});

	const [enabled, setEnabled] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!settings.data) return;
		setEnabled(settings.data.enabled);
	}, [settings.data]);

	const saveMutation = useMutation({
		mutationFn: () => api.updateAgentsEnabled({ agentsEnabled: enabled }),
		onSuccess: async () => {
			setError(null);
			await queryClient.invalidateQueries({ queryKey: ["agents-enabled"] });
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<div className="flex flex-col gap-4">
			<AdminBanner body={t("settings.agentsAdmin.adminBanner")} />
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.agentsAdmin.title")}
					</CardTitle>
					<CardDescription>
						{t("settings.agentsAdmin.description")}
					</CardDescription>
					<CardAction>
						<Badge variant={enabled ? "default" : "secondary"}>
							{enabled
								? t("settings.agentsAdmin.statusEnabled")
								: t("settings.agentsAdmin.statusDisabled")}
						</Badge>
					</CardAction>
				</CardHeader>
				<CardContent>
					<form
						className="flex max-w-md flex-col gap-5"
						onSubmit={(e) => {
							e.preventDefault();
							saveMutation.mutate();
						}}
					>
						<div className="border-border flex flex-col gap-2 rounded-lg border p-3.5">
							<div className="flex items-center gap-2 text-sm">
								<Checkbox
									id="agents-enabled"
									checked={enabled}
									// Block interaction until the current value has loaded, so a
									// click on the still-default `false` can't disable the feature.
									disabled={!settings.data}
									onCheckedChange={(v) => setEnabled(v === true)}
								/>
								<Label htmlFor="agents-enabled">
									{t("settings.agentsAdmin.enableLabel")}
								</Label>
							</div>
							<p className="text-muted-foreground text-xs">
								{t("settings.agentsAdmin.enableHint")}
							</p>
						</div>
						{error && <p className="text-destructive text-sm">{error}</p>}
						<div>
							<Button
								type="submit"
								disabled={saveMutation.isPending || !settings.data}
							>
								{t("settings.agentsAdmin.saveAction")}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
