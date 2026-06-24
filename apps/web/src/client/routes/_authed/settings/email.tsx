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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/settings/email")({
	component: EmailSection,
});

function EmailSection() {
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
						{t("settings.email.title")}
					</CardTitle>
					<CardDescription>{t("settings.systemAdminOnly")}</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	return <EmailSettingsCard />;
}

function EmailSettingsCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	const settings = useQuery({
		queryKey: ["emailSettings"],
		queryFn: () => api.getEmailSettings(),
	});

	const [enabled, setEnabled] = useState(false);
	const [fromAddress, setFromAddress] = useState("");
	const [fromName, setFromName] = useState("");
	const [error, setError] = useState<string | null>(null);

	// Sync the form when settings load.
	useEffect(() => {
		if (!settings.data) return;
		setEnabled(settings.data.emailEnabled);
		setFromAddress(settings.data.emailFromAddress ?? "");
		setFromName(settings.data.emailFromName ?? "");
	}, [settings.data]);

	const saveMutation = useMutation({
		mutationFn: () =>
			api.updateEmailSettings({
				emailEnabled: enabled,
				emailFromAddress: fromAddress.trim() || null,
				emailFromName: fromName.trim() || null,
			}),
		onSuccess: async () => {
			setError(null);
			await queryClient.invalidateQueries({ queryKey: ["emailSettings"] });
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<div className="flex flex-col gap-4">
			<AdminBanner body={t("settings.email.adminBanner")} />
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.email.title")}
					</CardTitle>
					<CardDescription>{t("settings.email.description")}</CardDescription>
					<CardAction>
						<Badge variant={enabled ? "default" : "secondary"}>
							{enabled
								? t("settings.email.statusEnabled")
								: t("settings.email.statusDisabled")}
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
									id="email-enabled"
									checked={enabled}
									onCheckedChange={(v) => setEnabled(v === true)}
								/>
								<Label htmlFor="email-enabled">
									{t("settings.email.enableLabel")}
								</Label>
							</div>
							<p className="text-muted-foreground text-xs">
								{t("settings.email.enableHint")}
							</p>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="email-from-address">
								{t("settings.email.fromAddress")}
							</Label>
							<Input
								id="email-from-address"
								type="email"
								value={fromAddress}
								placeholder="noreply@example.com"
								disabled={!enabled}
								className={cn(!enabled && "opacity-50")}
								onChange={(e) => setFromAddress(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="email-from-name">
								{t("settings.email.fromName")}
							</Label>
							<Input
								id="email-from-name"
								value={fromName}
								placeholder="Spantail"
								disabled={!enabled}
								className={cn(!enabled && "opacity-50")}
								onChange={(e) => setFromName(e.target.value)}
							/>
						</div>
						{error && <p className="text-destructive text-sm">{error}</p>}
						<div>
							<Button type="submit" disabled={saveMutation.isPending}>
								{t("settings.email.saveAction")}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
