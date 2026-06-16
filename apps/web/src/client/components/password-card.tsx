import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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

export function PasswordCard() {
	const { t } = useTranslation();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);

	const changeMutation = useMutation({
		mutationFn: async () => {
			const result = await authClient.changePassword({
				currentPassword,
				newPassword,
				// Other sessions keep the old credential; revoke them so a changed
				// password also locks out devices the user no longer trusts.
				revokeOtherSessions: true,
			});
			if (result.error) {
				throw new Error(result.error.message ?? t("errors.generic"));
			}
		},
		onSuccess: () => {
			toast.success(t("settings.password.changed"));
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			setError(null);
		},
		onError: (err: Error) => setError(err.message),
	});

	function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		if (newPassword !== confirmPassword) {
			setError(t("settings.password.mismatch"));
			return;
		}
		changeMutation.mutate();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.password.title")}
				</CardTitle>
				<CardDescription>{t("settings.password.description")}</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="current-password">
							{t("settings.password.current")}
						</Label>
						<Input
							id="current-password"
							type="password"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							autoComplete="current-password"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="new-password">{t("settings.password.new")}</Label>
						<Input
							id="new-password"
							type="password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							autoComplete="new-password"
							minLength={8}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="confirm-password">
							{t("settings.password.confirm")}
						</Label>
						<Input
							id="confirm-password"
							type="password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							autoComplete="new-password"
							minLength={8}
							required
						/>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div>
						<Button type="submit" disabled={changeMutation.isPending}>
							{t("settings.password.changeAction")}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
