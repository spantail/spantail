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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/settings/features")({
	component: FeaturesSection,
});

// Instance-wide feature toggles, grouped on one admin-only screen: AI agent
// logging, email delivery, and social login. Each is an independent setting
// with its own query key, rendered as a stacked card under a single admin gate.
function FeaturesSection() {
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
						{t("settings.nav.features")}
					</CardTitle>
					<CardDescription>{t("settings.systemAdminOnly")}</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<AdminBanner body={t("settings.features.adminBanner")} />
			<AgentsAdminCard />
			<EmailSettingsCard />
			<OauthSettingsCard />
		</div>
	);
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
	);
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
	);
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

	// Don't let an admin save before settings load: the form state is still its
	// defaults, so a premature submit would wipe the existing configuration.
	if (settings.isPending || !data) {
		return <p className="text-muted-foreground text-sm">{t("app.loading")}</p>;
	}

	return (
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
						// Block enabling an unconfigured provider, but keep an already
						// (stale-)enabled one editable so an admin can still turn it off
						// after its credentials are removed.
						disabled={!configured && !checked}
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
