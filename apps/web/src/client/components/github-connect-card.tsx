import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { GitHubIcon } from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";

/**
 * Connect GitHub for work attribution (issue #159): links the member's
 * GitHub account to their Spantail user via the instance App's
 * user-authorization flow. Distinct from social sign-in — this link only
 * attributes @spantail commands, it is never a sign-in method.
 */
export function GithubConnectCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	const appEnabled = useQuery({
		queryKey: ["github-app-enabled"],
		queryFn: () => api.getGithubAppEnabled(),
	});
	const identity = useQuery({
		queryKey: ["github-identity"],
		queryFn: () => api.getGithubIdentity(),
	});

	// The connect callback lands back here with ?github= status.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const status = params.get("github");
		if (!status) return;
		window.history.replaceState(null, "", window.location.pathname);
		if (status === "linked") {
			toast.success(t("settings.authentication.github.linked"));
			void queryClient.invalidateQueries({ queryKey: ["github-identity"] });
		} else if (status === "already_linked") {
			toast.error(t("settings.authentication.github.alreadyLinked"));
		} else {
			toast.error(t("settings.authentication.github.error"));
		}
	}, [t, queryClient]);

	const disconnectMutation = useMutation({
		mutationFn: () => api.disconnectGithubIdentity(),
		onSuccess: async () => {
			toast.success(t("settings.authentication.github.disconnected"));
			await queryClient.invalidateQueries({ queryKey: ["github-identity"] });
		},
		onError: (err: Error) => toast.error(err.message),
	});

	// Without an App there is nothing to connect to; linked users still see
	// the card so they can disconnect after an App removal.
	if (appEnabled.data?.enabled !== true && identity.data?.linked !== true) {
		return null;
	}

	const linked = identity.data?.linked === true;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.authentication.github.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.authentication.github.description")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex max-w-md items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<GitHubIcon className="size-5" />
						<div className="flex flex-col">
							<span className="text-sm font-medium">GitHub</span>
							<span className="text-muted-foreground text-xs">
								{linked && identity.data?.linked
									? t("settings.authentication.github.connectedAs", {
											login: identity.data.login,
										})
									: t("settings.authentication.github.notConnected")}
							</span>
						</div>
					</div>
					{linked ? (
						<Button
							variant="outline"
							size="sm"
							disabled={disconnectMutation.isPending}
							onClick={() => disconnectMutation.mutate()}
						>
							{t("settings.authentication.github.disconnect")}
						</Button>
					) : (
						<Button asChild variant="outline" size="sm">
							<a href="/api/github/connect">
								{t("settings.authentication.github.connect")}
							</a>
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
