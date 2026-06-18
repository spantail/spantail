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

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [mode, setMode] = useState<"login" | "signup">("login");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const providers = useQuery({
		queryKey: ["authProviders"],
		queryFn: () => api.getAuthProviders(),
	});

	async function signInSocial(provider: "google" | "github") {
		setError(null);
		// Redirects the browser to the provider; control does not return here on
		// success. Surface an error only if the call fails before redirecting.
		const result = await authClient.signIn.social({
			provider,
			callbackURL: "/",
		});
		if (result.error) {
			setError(result.error.message ?? t("errors.generic"));
		}
	}

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		const result =
			mode === "login"
				? await authClient.signIn.email({ email, password })
				: await authClient.signUp.email({ name, email, password });
		setBusy(false);
		if (result.error) {
			setError(result.error.message ?? t("errors.generic"));
			return;
		}
		await navigate({ to: "/" });
	}

	return (
		<div className="flex min-h-svh items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="font-heading text-xl">
						{mode === "login" ? t("auth.login") : t("auth.signup")}
					</CardTitle>
					<CardDescription>{t("app.tagline")}</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="flex flex-col gap-4">
						{mode === "signup" && (
							<div className="flex flex-col gap-2">
								<Label htmlFor="name">{t("auth.name")}</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									required
								/>
							</div>
						)}
						<div className="flex flex-col gap-2">
							<Label htmlFor="email">{t("auth.email")}</Label>
							<Input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								autoComplete="email"
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="password">{t("auth.password")}</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								autoComplete={
									mode === "login" ? "current-password" : "new-password"
								}
								minLength={8}
								required
							/>
						</div>
						{error && <p className="text-destructive text-sm">{error}</p>}
						<Button type="submit" disabled={busy}>
							{mode === "login"
								? t("auth.loginAction")
								: t("auth.signupAction")}
						</Button>
					</form>
					{(providers.data?.google || providers.data?.github) && (
						<div className="mt-4 flex flex-col gap-3">
							<div className="flex items-center gap-3">
								<span className="bg-border h-px flex-1" />
								<span className="text-muted-foreground text-xs">
									{t("auth.orContinueWith")}
								</span>
								<span className="bg-border h-px flex-1" />
							</div>
							{providers.data?.google && (
								<Button
									type="button"
									variant="outline"
									onClick={() => signInSocial("google")}
								>
									{t("auth.continueWithGoogle")}
								</Button>
							)}
							{providers.data?.github && (
								<Button
									type="button"
									variant="outline"
									onClick={() => signInSocial("github")}
								>
									{t("auth.continueWithGithub")}
								</Button>
							)}
						</div>
					)}
					{mode === "login" && (
						<button
							type="button"
							className="text-muted-foreground mt-4 block text-sm underline-offset-4 hover:underline"
							onClick={() => navigate({ to: "/forgot-password" })}
						>
							{t("auth.forgotPassword")}
						</button>
					)}
					{/* Public sign-up is closed once the instance is claimed; the toggle
					  appears only to bootstrap the first super-admin. Everyone else
					  joins by invitation or social sign-in. */}
					{providers.data?.selfSignupAvailable && (
						<button
							type="button"
							className="text-muted-foreground mt-4 text-sm underline-offset-4 hover:underline"
							onClick={() => {
								setMode(mode === "login" ? "signup" : "login");
								setError(null);
							}}
						>
							{mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}
						</button>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
