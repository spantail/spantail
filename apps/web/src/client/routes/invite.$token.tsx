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
					<CardDescription>
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
					)}
				</CardContent>
			</Card>
		</div>
	);
}
