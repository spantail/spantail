import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { authClient } from "@/lib/auth-client";
import { useDocumentTitle } from "@/lib/document-title";

export const Route = createFileRoute("/invite/$token")({
	component: InvitePage,
});

function InvitePage() {
	const { t } = useTranslation();
	const { token } = Route.useParams();
	const navigate = useNavigate();

	const preview = useQuery({
		queryKey: ["invitation", token],
		queryFn: () => api.getInvitation(token),
		retry: false,
	});
	const providers = useQuery({
		queryKey: ["authProviders"],
		queryFn: () => api.getAuthProviders(),
	});

	useDocumentTitle(`${t("invite.title")} | ${t("app.name")}`);

	async function acceptWithGoogle() {
		setError(null);
		// Starts Google sign-in; the standing invitation is consumed server-side
		// when the chosen Google account's email matches the invited address.
		// Control does not return here on success (the browser is redirected).
		const result = await authClient.signIn.social({
			provider: "google",
			callbackURL: "/",
		});
		if (result.error) {
			setError(result.error.message ?? t("errors.generic"));
		}
	}

	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		if (!preview.data) return;
		setBusy(true);
		setError(null);
		try {
			await api.acceptInvitation(token, { name, password });
			// The account now exists; sign in and land on the app.
			const result = await authClient.signIn.email({
				email: preview.data.email,
				password,
			});
			if (result.error) {
				await navigate({ to: "/login" });
				return;
			}
			await navigate({ to: "/" });
		} catch (err) {
			setError(err instanceof Error ? err.message : t("errors.generic"));
			setBusy(false);
		}
	}

	return (
		<div className="flex min-h-svh items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="font-heading text-xl">
						{t("invite.title")}
					</CardTitle>
					{/* whitespace-pre-line so the tagline's phrase-boundary newline (ja)
					  renders as a break here too; invite.description has no newline. */}
					<CardDescription className="whitespace-pre-line">
						{preview.isSuccess
							? t("invite.description", { email: preview.data.email })
							: t("app.tagline")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{preview.isPending && (
						<p className="text-muted-foreground text-sm">{t("app.loading")}</p>
					)}
					{preview.isError && (
						<div className="flex flex-col gap-4">
							<p className="text-destructive text-sm">{t("invite.invalid")}</p>
							<Button
								variant="secondary"
								onClick={() => navigate({ to: "/login" })}
							>
								{t("invite.toLogin")}
							</Button>
						</div>
					)}
					{preview.isSuccess && (
						<>
							<form onSubmit={onSubmit} className="flex flex-col gap-4">
								<div className="flex flex-col gap-2">
									<Label htmlFor="invite-name">{t("auth.name")}</Label>
									<Input
										id="invite-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										required
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="invite-password">{t("auth.password")}</Label>
									<Input
										id="invite-password"
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										autoComplete="new-password"
										minLength={8}
										required
									/>
								</div>
								{error && <p className="text-destructive text-sm">{error}</p>}
								<Button type="submit" disabled={busy}>
									{t("invite.acceptAction")}
								</Button>
							</form>
							{providers.data?.google && (
								<div className="mt-4 flex flex-col gap-3">
									<div className="flex items-center gap-3">
										<span className="bg-border h-px flex-1" />
										<span className="text-muted-foreground text-xs">
											{t("auth.orContinueWith")}
										</span>
										<span className="bg-border h-px flex-1" />
									</div>
									<Button
										type="button"
										variant="outline"
										onClick={acceptWithGoogle}
									>
										{t("auth.continueWithGoogle")}
									</Button>
									<p className="text-muted-foreground text-xs">
										{t("invite.googleHint", { email: preview.data.email })}
									</p>
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
