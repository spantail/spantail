import type { OauthProvider } from "@spantail/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { GitHubIcon, GoogleIcon } from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

// Where the OAuth provider returns after a link round-trip: back to this screen
// so the freshly linked account shows immediately.
const linkCallbackPath = "/settings/authentication";

const PROVIDERS: {
	id: OauthProvider;
	name: string;
	Icon: React.ComponentType<{ className?: string }>;
}[] = [
	{ id: "google", name: "Google", Icon: GoogleIcon },
	{ id: "github", name: "GitHub", Icon: GitHubIcon },
];

export function ConnectedAccountsCard() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	// Which providers the instance offers (admin-enabled and configured): only
	// these can be linked. Mirrors the login screen's provider gating.
	const providers = useQuery({
		queryKey: ["authProviders"],
		queryFn: () => api.getAuthProviders(),
	});

	// The caller's own linked accounts. Includes the password credential, so its
	// length also tells us when unlinking the last sign-in method is blocked.
	const accounts = useQuery({
		queryKey: ["linked-accounts"],
		queryFn: async () => {
			const result = await authClient.listAccounts();
			if (result.error) {
				throw new Error(result.error.message ?? t("errors.generic"));
			}
			return result.data;
		},
	});

	const unlinkMutation = useMutation({
		mutationFn: async (provider: OauthProvider) => {
			const result = await authClient.unlinkAccount({ providerId: provider });
			if (result.error) {
				throw new Error(result.error.message ?? t("errors.generic"));
			}
		},
		onSuccess: async () => {
			toast.success(t("settings.authentication.disconnected"));
			await queryClient.invalidateQueries({ queryKey: ["linked-accounts"] });
		},
		onError: (err: Error) => toast.error(err.message),
	});

	async function connect(provider: OauthProvider) {
		const result = await authClient.linkSocial({
			provider,
			callbackURL: `${window.location.origin}${linkCallbackPath}`,
		});
		if (result.error) {
			toast.error(result.error.message ?? t("errors.generic"));
		}
		// On success the browser is redirected to the provider; nothing else to do.
	}

	const linked = new Set(accounts.data?.map((a) => a.providerId) ?? []);
	// Total sign-in methods (social + password). Better Auth refuses to unlink the
	// last one; disable the button to surface that before the request.
	const isLastAccount = (accounts.data?.length ?? 0) <= 1;

	const rows = PROVIDERS.filter((p) => {
		const enabled =
			p.id === "google" ? providers.data?.google : providers.data?.github;
		// Show a provider only if it can be linked now, or is already linked (so a
		// user can still disconnect a provider an admin later disabled).
		return enabled || linked.has(p.id);
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.authentication.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.authentication.description")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{accounts.isPending || providers.isPending ? (
					<p className="text-muted-foreground text-sm">{t("app.loading")}</p>
				) : rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("settings.authentication.noneAvailable")}
					</p>
				) : (
					<ul className="flex max-w-md flex-col divide-y">
						{rows.map(({ id, name, Icon }) => {
							const isLinked = linked.has(id);
							return (
								<li
									key={id}
									className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
								>
									<div className="flex items-center gap-3">
										<Icon className="size-5" />
										<div className="flex flex-col">
											<span className="text-sm font-medium">{name}</span>
											<span className="text-muted-foreground text-xs">
												{isLinked
													? t("settings.authentication.connected")
													: t("settings.authentication.notConnected")}
											</span>
										</div>
									</div>
									{isLinked ? (
										<Button
											variant="outline"
											size="sm"
											disabled={isLastAccount || unlinkMutation.isPending}
											title={
												isLastAccount
													? t("settings.authentication.lastAccount")
													: undefined
											}
											onClick={() => unlinkMutation.mutate(id)}
										>
											{t("settings.authentication.disconnect")}
										</Button>
									) : (
										<Button
											variant="outline"
											size="sm"
											onClick={() => connect(id)}
										>
											{t("settings.authentication.connect")}
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
