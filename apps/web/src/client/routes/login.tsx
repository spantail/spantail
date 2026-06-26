import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { SpantailMark } from "@/components/spantail-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useDocumentTitle } from "@/lib/document-title";
import { queryClient } from "@/lib/query";

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

	useDocumentTitle(
		`${mode === "login" ? t("auth.login") : t("auth.signup")} | ${t("app.name")}`,
	);

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
		// Drop any cached server state from a previous session on this browser so
		// the newly signed-in user never sees the prior account's data. This is the
		// authoritative point: it covers every way a prior session ended (explicit
		// sign-out, expiry redirect, cleared cookie). Social login redirects through
		// a full page load, which recreates the cache, so it needs no clear here.
		queryClient.clear();
		await navigate({ to: "/" });
	}

	const showSocial = providers.data?.google || providers.data?.github;

	return (
		<div className="grid min-h-svh lg:grid-cols-2">
			{/* Brand panel — a fixed dark showcase, shown on wide viewports only. */}
			<section className="relative hidden flex-col justify-between overflow-hidden bg-[#20262d] p-16 text-[#f4f7fa] lg:flex">
				<SpantailMark
					size={340}
					className="pointer-events-none absolute -right-16 -bottom-14 opacity-90"
				/>
				<div className="relative z-10 flex items-center gap-3">
					<SpantailMark size={44} />
					<span className="font-heading text-2xl font-bold tracking-tight">
						{t("app.name")}
					</span>
				</div>
				<div className="relative z-10 max-w-[30ch]">
					<h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight">
						{mode === "login"
							? t("auth.welcomeBack")
							: t("auth.welcomeToApp", { name: t("app.name") })}
					</h1>
					<p className="mt-4 text-base leading-relaxed text-[#aeb6bf]">
						{t("app.tagline")}
					</p>
				</div>
				<div className="relative z-10 text-sm text-[#7e8893]">
					{t("auth.brandFooter")}
				</div>
			</section>

			{/* Form panel — always visible; stands alone on small screens. */}
			<section className="flex items-center justify-center p-6 sm:p-12">
				<div className="w-full max-w-sm">
					{/* Compact lockup for small screens, where the brand panel is hidden. */}
					<div className="mb-8 flex items-center gap-2.5 lg:hidden">
						<SpantailMark size={36} />
						<span className="font-heading text-xl font-bold tracking-tight">
							{t("app.name")}
						</span>
					</div>

					<div className="mb-8">
						<h2 className="font-heading text-2xl font-semibold tracking-tight">
							{mode === "login" ? t("auth.login") : t("auth.signup")}
						</h2>
						<p className="text-muted-foreground mt-2 text-sm">
							{mode === "login"
								? t("auth.loginSubtitle")
								: t("auth.signupSubtitle")}
						</p>
					</div>

					<form onSubmit={onSubmit} className="flex flex-col gap-4">
						{mode === "signup" && (
							<div className="flex flex-col gap-2">
								<Label htmlFor="name">{t("auth.name")}</Label>
								<Input
									id="name"
									className="h-11"
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
								className="h-11"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								autoComplete="email"
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<div className="flex items-baseline justify-between">
								<Label htmlFor="password">{t("auth.password")}</Label>
								{mode === "login" && (
									<button
										type="button"
										className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
										onClick={() => navigate({ to: "/forgot-password" })}
									>
										{t("auth.forgotPassword")}
									</button>
								)}
							</div>
							<Input
								id="password"
								type="password"
								className="h-11"
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
						<Button type="submit" className="mt-1 h-11 w-full" disabled={busy}>
							{mode === "login"
								? t("auth.loginAction")
								: t("auth.signupAction")}
						</Button>
					</form>

					{showSocial && (
						<div className="mt-6 flex flex-col gap-3">
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
									className="h-11 w-full"
									onClick={() => signInSocial("google")}
								>
									<GoogleIcon />
									{t("auth.continueWithGoogle")}
								</Button>
							)}
							{providers.data?.github && (
								<Button
									type="button"
									variant="outline"
									className="h-11 w-full"
									onClick={() => signInSocial("github")}
								>
									<GithubIcon />
									{t("auth.continueWithGithub")}
								</Button>
							)}
						</div>
					)}

					{/* Public sign-up is closed once the instance is claimed; the toggle
					  appears only to bootstrap the first super-admin. Everyone else
					  joins by invitation or social sign-in. */}
					{providers.data?.selfSignupAvailable && (
						<p className="text-muted-foreground mt-8 text-center text-sm">
							<button
								type="button"
								className="text-foreground font-semibold underline-offset-4 hover:underline"
								onClick={() => {
									setMode(mode === "login" ? "signup" : "login");
									setError(null);
								}}
							>
								{mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}
							</button>
						</p>
					)}
				</div>
			</section>
		</div>
	);
}

function GoogleIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]">
			<path
				fill="#4285F4"
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
			/>
			<path
				fill="#34A853"
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
			/>
			<path
				fill="#FBBC05"
				d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
			/>
			<path
				fill="#EA4335"
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
			/>
		</svg>
	);
}

function GithubIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			className="size-[18px] fill-current"
		>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M12 1C5.92 1 1 5.96 1 12.08c0 4.9 3.15 9.05 7.52 10.52.55.1.75-.24.75-.53l-.01-1.86c-3.06.67-3.71-1.49-3.71-1.49-.5-1.28-1.22-1.62-1.22-1.62-1-.69.07-.68.07-.68 1.11.08 1.69 1.15 1.69 1.15.98 1.7 2.58 1.2 3.21.92.1-.72.39-1.2.7-1.48-2.44-.28-5.01-1.23-5.01-5.48 0-1.21.43-2.2 1.14-2.98-.11-.28-.49-1.41.11-2.93 0 0 .93-.3 3.05 1.14a10.5 10.5 0 0 1 5.55 0c2.12-1.44 3.05-1.14 3.05-1.14.6 1.52.22 2.65.11 2.93.71.78 1.14 1.77 1.14 2.98 0 4.26-2.58 5.2-5.03 5.47.4.35.75 1.03.75 2.08l-.01 3.08c0 .3.2.64.76.53A11.02 11.02 0 0 0 23 12.08C23 5.96 18.08 1 12 1z"
			/>
		</svg>
	);
}
