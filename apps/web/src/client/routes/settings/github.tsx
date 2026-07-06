import type { GithubAppStatus } from "@spantail/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AdminBanner } from "@/components/admin-banner";
import { SettingsSection } from "@/components/settings-section";
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
import { api } from "@/lib/api";

export const Route = createFileRoute("/settings/github")({
	component: GithubSection,
});

// Instance-admin management of the BYO GitHub App (issue #159): register the
// App via the Manifest flow, see its status, and review installations.
function GithubSection() {
	const { t } = useTranslation();
	return (
		<SettingsSection title={t("settings.nav.github")}>
			<GithubContent />
		</SettingsSection>
	);
}

function GithubContent() {
	const { t } = useTranslation();
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

	// The setup callback redirects here with ?github_error= on failure.
	const [flowError, setFlowError] = useState<string | null>(null);
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const error = params.get("github_error");
		if (error) {
			setFlowError(error);
			window.history.replaceState(null, "", window.location.pathname);
		}
	}, []);

	if (me.isPending) {
		return <p className="text-muted-foreground text-sm">{t("app.loading")}</p>;
	}
	if (!me.data?.user.isAdmin) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.github.title")}
					</CardTitle>
					<CardDescription>{t("settings.systemAdminOnly")}</CardDescription>
				</CardHeader>
			</Card>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<AdminBanner body={t("settings.github.adminBanner")} />
			{flowError && (
				<p className="text-destructive text-sm">
					{t("settings.github.flowError", { code: flowError })}
				</p>
			)}
			<GithubAppCard />
			<InstallationsCard />
		</div>
	);
}

/** Posts the manifest to GitHub via a self-submitting form (the documented flow). */
function submitManifestForm(action: string, manifest: string): void {
	const form = document.createElement("form");
	form.method = "post";
	form.action = action;
	const field = document.createElement("input");
	field.type = "hidden";
	field.name = "manifest";
	field.value = manifest;
	form.appendChild(field);
	document.body.appendChild(form);
	form.submit();
}

function GithubAppCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const status = useQuery({
		queryKey: ["github-app"],
		queryFn: () => api.getGithubAppStatus(),
	});

	const [ownerKind, setOwnerKind] = useState<"personal" | "org">("org");
	const [org, setOrg] = useState("");

	const registerMutation = useMutation({
		mutationFn: () =>
			api.createGithubAppManifest({
				owner: ownerKind === "org" ? org.trim() : null,
			}),
		onSuccess: ({ action, manifest }) => submitManifestForm(action, manifest),
		onError: (err: Error) => toast.error(err.message),
	});

	const removeMutation = useMutation({
		mutationFn: () => api.deleteGithubApp(),
		onSuccess: async () => {
			toast.success(t("settings.github.app.removed"));
			await queryClient.invalidateQueries({ queryKey: ["github-app"] });
			await queryClient.invalidateQueries({ queryKey: ["github-app-enabled"] });
		},
		onError: (err: Error) => toast.error(err.message),
	});

	if (status.isPending) {
		return <p className="text-muted-foreground text-sm">{t("app.loading")}</p>;
	}
	const app = status.data?.app ?? null;

	if (!app) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="font-heading text-base">
						{t("settings.github.register.title")}
					</CardTitle>
					<CardDescription>
						{t("settings.github.register.description")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex max-w-md flex-col gap-5"
						onSubmit={(e) => {
							e.preventDefault();
							registerMutation.mutate();
						}}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="gh-owner">
								{t("settings.github.register.ownerLabel")}
							</Label>
							<Select
								value={ownerKind}
								onValueChange={(v) => setOwnerKind(v as "personal" | "org")}
							>
								<SelectTrigger id="gh-owner" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="org">
										{t("settings.github.register.ownerOrg")}
									</SelectItem>
									<SelectItem value="personal">
										{t("settings.github.register.ownerPersonal")}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{ownerKind === "org" && (
							<div className="flex flex-col gap-2">
								<Label htmlFor="gh-org">
									{t("settings.github.register.orgLabel")}
								</Label>
								<Input
									id="gh-org"
									value={org}
									placeholder="my-org"
									onChange={(e) => setOrg(e.target.value)}
								/>
							</div>
						)}
						<p className="text-muted-foreground text-xs">
							{t("settings.github.register.hint")}
						</p>
						<div>
							<Button
								type="submit"
								disabled={
									registerMutation.isPending ||
									(ownerKind === "org" && org.trim() === "")
								}
							>
								{t("settings.github.register.action")}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.github.app.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.github.app.description")}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-2 text-sm">
					<dt className="text-muted-foreground">
						{t("settings.github.app.slug")}
					</dt>
					<dd>{app.slug}</dd>
					<dt className="text-muted-foreground">
						{t("settings.github.app.owner")}
					</dt>
					<dd>{app.ownerLogin}</dd>
					<dt className="text-muted-foreground">
						{t("settings.github.app.appId")}
					</dt>
					<dd>{app.appId}</dd>
				</dl>
				<div className="flex items-center gap-2">
					<Button asChild variant="outline" size="sm">
						<a
							href={`https://github.com/apps/${app.slug}`}
							target="_blank"
							rel="noreferrer"
						>
							{t("settings.github.app.viewOnGithub")}
							<ExternalLinkIcon className="size-3.5" />
						</a>
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={removeMutation.isPending}
						onClick={() => {
							if (window.confirm(t("settings.github.app.removeConfirm"))) {
								removeMutation.mutate();
							}
						}}
					>
						{t("settings.github.app.remove")}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function InstallationsCard() {
	const { t } = useTranslation();
	const status = useQuery({
		queryKey: ["github-app"],
		queryFn: () => api.getGithubAppStatus(),
	});
	const app = status.data?.app ?? null;
	if (!app) return null;
	const installations: GithubAppStatus["installations"] =
		status.data?.installations ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.github.installations.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.github.installations.description")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{installations.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("settings.github.installations.empty")}{" "}
						<a
							className="underline"
							href={`https://github.com/apps/${app.slug}/installations/new`}
							target="_blank"
							rel="noreferrer"
						>
							{t("settings.github.installations.install")}
						</a>
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									{t("settings.github.installations.account")}
								</TableHead>
								<TableHead>{t("settings.github.installations.type")}</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{installations.map((row) => (
								<TableRow key={row.installationId}>
									<TableCell>{row.accountLogin}</TableCell>
									<TableCell className="text-muted-foreground">
										{row.accountType}
									</TableCell>
									<TableCell>
										{row.suspended && (
											<Badge variant="secondary">
												{t("settings.github.installations.suspended")}
											</Badge>
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
