import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminBanner } from "@/components/admin-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/settings/oauth")({
	component: OauthSection,
});

function OauthSection() {
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
						{t("settings.oauth.title")}
					</CardTitle>
					<CardDescription>{t("settings.systemAdminOnly")}</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	return <OauthSettingsCard />;
}

// Free-form textarea (newline/comma separated) <-> string[] for the allowlist.
function parseDomains(text: string): string[] {
	return text
		.split(/[\n,]/)
		.map((d) => d.trim())
		.filter(Boolean);
}

function OauthSettingsCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	const settings = useQuery({
		queryKey: ["oauthSettings"],
		queryFn: () => api.getOauthSettings(),
	});

	const [googleEnabled, setGoogleEnabled] = useState(false);
	const [githubEnabled, setGithubEnabled] = useState(false);
	const [domainsText, setDomainsText] = useState("");
	const [error, setError] = useState<string | null>(null);

	// Sync the form when settings load.
	useEffect(() => {
		if (!settings.data) return;
		setGoogleEnabled(settings.data.google.enabled);
		setGithubEnabled(settings.data.github.enabled);
		setDomainsText(settings.data.googleAllowedDomains.join("\n"));
	}, [settings.data]);

	const saveMutation = useMutation({
		mutationFn: () =>
			api.updateOauthSettings({
				googleOAuthEnabled: googleEnabled,
				githubOAuthEnabled: githubEnabled,
				googleAllowedDomains: parseDomains(domainsText),
			}),
		onSuccess: async () => {
			setError(null);
			await queryClient.invalidateQueries({ queryKey: ["oauthSettings"] });
			await queryClient.invalidateQueries({ queryKey: ["authProviders"] });
		},
		onError: (err: Error) => setError(err.message),
	});

	const data = settings.data;

	return (
		<div className="flex flex-col gap-4">
			<AdminBanner body={t("settings.oauth.adminBanner")} />
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.oauth.title")}
					</CardTitle>
					<CardDescription>{t("settings.oauth.description")}</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex max-w-md flex-col gap-5"
						onSubmit={(e) => {
							e.preventDefault();
							saveMutation.mutate();
						}}
					>
						<ProviderToggle
							id="google-enabled"
							label={t("settings.oauth.googleLabel")}
							configured={data?.google.configured ?? false}
							checked={googleEnabled}
							onChange={setGoogleEnabled}
						/>
						<div className="flex flex-col gap-2">
							<Label htmlFor="google-allowed-domains">
								{t("settings.oauth.allowedDomainsLabel")}
							</Label>
							<Textarea
								id="google-allowed-domains"
								rows={3}
								value={domainsText}
								placeholder={"example.com\nexample.org"}
								disabled={!googleEnabled}
								className={cn(!googleEnabled && "opacity-50")}
								onChange={(e) => setDomainsText(e.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								{t("settings.oauth.allowedDomainsHint")}
							</p>
						</div>
						<ProviderToggle
							id="github-enabled"
							label={t("settings.oauth.githubLabel")}
							configured={data?.github.configured ?? false}
							checked={githubEnabled}
							onChange={setGithubEnabled}
						/>
						{error && <p className="text-destructive text-sm">{error}</p>}
						<div>
							<Button type="submit" disabled={saveMutation.isPending}>
								{t("settings.oauth.saveAction")}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

function ProviderToggle({
	id,
	label,
	configured,
	checked,
	onChange,
}: {
	id: string;
	label: string;
	configured: boolean;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="border-border flex flex-col gap-2 rounded-lg border p-3.5">
			<div className="flex items-center justify-between gap-2 text-sm">
				<div className="flex items-center gap-2">
					<Checkbox
						id={id}
						checked={checked}
						disabled={!configured}
						onCheckedChange={(v) => onChange(v === true)}
					/>
					<Label htmlFor={id}>{label}</Label>
				</div>
				<Badge variant={checked ? "default" : "secondary"}>
					{checked
						? t("settings.oauth.statusEnabled")
						: t("settings.oauth.statusDisabled")}
				</Badge>
			</div>
			{!configured && (
				<p className="text-muted-foreground text-xs">
					{t("settings.oauth.notConfiguredHint")}
				</p>
			)}
		</div>
	);
}
