import { useMutation } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";

// Coarse password-strength heuristic (0–4) driving the meter below the field.
// Length is weighted, with a bonus for mixing character classes.
function scorePassword(pw: string): number {
	let score = 0;
	if (pw.length >= 8) score++;
	if (pw.length >= 12) score++;
	if (/[a-z]/.test(pw) && /[0-9]/.test(pw)) score++;
	if (/[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
	return Math.min(score, 4);
}

const STRENGTH_KEYS = [
	"",
	"settings.password.strength.weak",
	"settings.password.strength.fair",
	"settings.password.strength.good",
	"settings.password.strength.strong",
];

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

	const score = scorePassword(newPassword);
	const mismatch =
		confirmPassword.length > 0 && confirmPassword !== newPassword;
	const matches = confirmPassword.length > 0 && confirmPassword === newPassword;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-base">
					{t("settings.password.title")}
				</CardTitle>
				<CardDescription>{t("settings.password.description")}</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
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
						{newPassword ? (
							<div className="flex items-center gap-2">
								<div className="flex flex-1 gap-1">
									{[0, 1, 2, 3].map((i) => (
										<span
											key={i}
											className={cn(
												"h-1 flex-1 rounded-full transition-colors",
												i < score ? "bg-foreground" : "bg-muted",
											)}
										/>
									))}
								</div>
								<span className="text-muted-foreground w-12 text-right text-xs font-medium">
									{t(STRENGTH_KEYS[score] ?? "")}
								</span>
							</div>
						) : (
							<p className="text-muted-foreground text-xs">
								{t("settings.password.strengthHint")}
							</p>
						)}
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
							className={cn(
								mismatch &&
									"border-destructive/60 focus-visible:ring-destructive/40",
							)}
						/>
						{mismatch && (
							<p className="text-destructive text-xs">
								{t("settings.password.mismatch")}
							</p>
						)}
						{matches && (
							<p className="text-muted-foreground flex items-center gap-1 text-xs">
								<CheckIcon className="size-3" />
								{t("settings.password.match")}
							</p>
						)}
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
