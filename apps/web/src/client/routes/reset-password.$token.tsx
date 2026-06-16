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
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password/$token")({
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const { t } = useTranslation();
	const { token } = Route.useParams();
	const navigate = useNavigate();

	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		if (newPassword !== confirmPassword) {
			setError(t("settings.password.mismatch"));
			return;
		}
		setBusy(true);
		setError(null);
		const result = await authClient.resetPassword({ newPassword, token });
		setBusy(false);
		if (result.error) {
			setError(result.error.message ?? t("auth.resetInvalid"));
			return;
		}
		await navigate({ to: "/login" });
	}

	return (
		<div className="flex min-h-svh items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="font-heading text-xl">
						{t("auth.resetPasswordTitle")}
					</CardTitle>
					<CardDescription>
						{t("auth.resetPasswordDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="reset-new-password">
								{t("settings.password.new")}
							</Label>
							<Input
								id="reset-new-password"
								type="password"
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
								autoComplete="new-password"
								minLength={8}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="reset-confirm-password">
								{t("settings.password.confirm")}
							</Label>
							<Input
								id="reset-confirm-password"
								type="password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								autoComplete="new-password"
								minLength={8}
								required
							/>
						</div>
						{error && <p className="text-destructive text-sm">{error}</p>}
						<Button type="submit" disabled={busy}>
							{t("auth.resetPasswordAction")}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
