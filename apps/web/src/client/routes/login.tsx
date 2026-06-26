import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { GitHubIcon, GoogleIcon } from "@/components/provider-icons";
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
			<section className="hidden flex-col justify-between bg-[#20262d] p-16 text-[#f4f7fa] lg:flex">
				<div className="flex items-center gap-3">
					<SpantailMark size={60} />
					<span className="font-heading text-3xl font-bold tracking-tight">
						{t("app.name")}
					</span>
				</div>
				<div className="max-w-[30ch]">
					{/* Decorative greeting, not the page heading — the form title is the
					  single <h1> (present at every breakpoint; this panel is hidden on
					  small screens). */}
					<p className="font-heading text-4xl leading-tight font-semibold tracking-tight">
						{mode === "login"
							? t("auth.welcomeBack")
							: t("auth.welcomeToApp", { name: t("app.name") })}
					</p>
					{/* whitespace-pre-line honors the explicit newline in the Japanese
					  tagline so it wraps at the phrase boundary instead of mid-word;
					  locales without a newline (en) just wrap normally. */}
					<p className="mt-4 text-base leading-relaxed whitespace-pre-line text-[#aeb6bf]">
						{t("app.tagline")}
					</p>
				</div>
				<div className="text-[13px] tracking-[0.01em] text-[#7e8893]">
					<a
						href="https://spantail.com"
						target="_blank"
						rel="noopener noreferrer"
						className="underline-offset-4 hover:text-[#aeb6bf] hover:underline"
					>
						© {new Date().getFullYear()} {t("app.name")}
					</a>
				</div>
			</section>

			{/* Form panel — always visible; stands alone on small screens. */}
			<section className="flex items-center justify-center p-6 sm:p-12">
				<div className="w-full max-w-sm">
					{/* Compact lockup for small screens, where the brand panel is hidden. */}
					<div className="mb-8 flex items-center gap-2.5 lg:hidden">
						<SpantailMark size={44} />
						<span className="font-heading text-2xl font-bold tracking-tight">
							{t("app.name")}
						</span>
					</div>

					<div className="mb-8">
						<h1 className="font-heading text-2xl font-semibold tracking-tight">
							{mode === "login" ? t("auth.login") : t("auth.signup")}
						</h1>
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
								placeholder={t("auth.emailPlaceholder")}
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
								placeholder={t("auth.passwordPlaceholder")}
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
						<Button type="submit" className="mt-1 h-12 w-full" disabled={busy}>
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
									className="h-12 w-full"
									onClick={() => signInSocial("google")}
								>
									<GoogleIcon className="size-[18px]" decorative />
									{t("auth.continueWithGoogle")}
								</Button>
							)}
							{providers.data?.github && (
								<Button
									type="button"
									variant="outline"
									className="h-12 w-full"
									onClick={() => signInSocial("github")}
								>
									<GitHubIcon className="size-[18px]" decorative />
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
