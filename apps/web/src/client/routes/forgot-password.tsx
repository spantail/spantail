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

export const Route = createFileRoute("/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();

	const emailEnabled = useQuery({
		queryKey: ["emailEnabled"],
		queryFn: () => api.getEmailEnabled(),
		retry: false,
	});

	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);
	const [busy, setBusy] = useState(false);

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		// Always show the same confirmation regardless of outcome so the form
		// never reveals whether an account exists for this address.
		await authClient.requestPasswordReset({ email });
		setBusy(false);
		setSent(true);
	}

	return (
		<div className="flex min-h-svh items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="font-heading text-xl">
						{emailEnabled.data?.enabled === false
							? t("auth.recoveryUnavailableTitle")
							: t("auth.forgotPasswordTitle")}
					</CardTitle>
					<CardDescription>
						{emailEnabled.data?.enabled === false
							? t("auth.recoveryUnavailableDescription")
							: t("auth.forgotPasswordDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{emailEnabled.isPending && (
						<p className="text-muted-foreground text-sm">{t("app.loading")}</p>
					)}
					{emailEnabled.data?.enabled &&
						(sent ? (
							<p className="text-muted-foreground text-sm">
								{t("auth.resetSentNotice")}
							</p>
						) : (
							<form onSubmit={onSubmit} className="flex flex-col gap-4">
								<div className="flex flex-col gap-2">
									<Label htmlFor="forgot-email">{t("auth.email")}</Label>
									<Input
										id="forgot-email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										autoComplete="email"
										required
									/>
								</div>
								<Button type="submit" disabled={busy}>
									{t("auth.sendResetLink")}
								</Button>
							</form>
						))}
					<Button
						variant="secondary"
						onClick={() => navigate({ to: "/login" })}
					>
						{t("auth.backToLogin")}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
