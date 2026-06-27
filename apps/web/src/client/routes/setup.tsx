import type { Me } from "@spantail/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Navigate,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SpantailMark } from "@/components/spantail-mark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceForm } from "@/components/workspace-form";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useDocumentTitle } from "@/lib/document-title";

export const Route = createFileRoute("/setup")({
	beforeLoad: async () => {
		const { data } = await authClient.getSession();
		if (!data) {
			throw redirect({ to: "/login" });
		}
	},
	component: SetupRoute,
});

// Matches the `hue` column default in the db schema; the wizard keeps project
// creation to name + slug, leaving color choice to the settings screen.
const DEFAULT_PROJECT_HUE = 264;
const TOTAL_STEPS = 5;

function SetupRoute() {
	const { t } = useTranslation();
	useDocumentTitle(t("onboarding.title"));
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });

	if (me.isPending) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<p className="text-muted-foreground">{t("app.loading")}</p>
			</div>
		);
	}
	if (me.isError || !me.data) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<p className="text-destructive">{t("errors.generic")}</p>
			</div>
		);
	}
	return <SetupGate me={me.data} />;
}

// Decide once, on mount, whether the wizard applies. Creating the workspace in
// step 1 flips memberships to non-empty, which must not eject the user
// mid-flow; freezing the decision keeps them in the wizard until they finish.
function SetupGate({ me }: { me: Me }) {
	const [eligible] = useState(
		() => me.user.isAdmin && me.memberships.length === 0,
	);
	if (!eligible) {
		return <Navigate to="/" replace />;
	}
	return <Wizard />;
}

function Wizard() {
	const { t } = useTranslation();
	const [step, setStep] = useState(1);
	const [workspace, setWorkspace] = useState<{
		id: string;
		slug: string;
	} | null>(null);

	return (
		<div className="bg-muted/30 flex min-h-svh flex-col items-center px-4 py-10">
			<div className="mb-8 flex items-center gap-2.5">
				<SpantailMark size={36} />
				<span className="font-heading text-xl font-bold tracking-tight">
					{t("app.name")}
				</span>
			</div>
			<div className="w-full max-w-xl">
				<div className="mb-6">
					<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						{t("onboarding.step", { current: step, total: TOTAL_STEPS })}
					</p>
					<h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight">
						{t("onboarding.title")}
					</h1>
				</div>
				<div className="bg-background rounded-xl border p-6 shadow-sm">
					{step === 1 && (
						<WorkspaceStep
							onCreated={(ws) => {
								setWorkspace({ id: ws.id, slug: ws.slug });
								setStep(2);
							}}
						/>
					)}
					{step === 2 && workspace && (
						<ProjectStep
							workspaceId={workspace.id}
							onBack={() => setStep(1)}
							onNext={() => setStep(3)}
						/>
					)}
					{step === 3 && (
						<InstanceStep onBack={() => setStep(2)} onNext={() => setStep(4)} />
					)}
					{step === 4 && (
						<InviteStep onBack={() => setStep(3)} onNext={() => setStep(5)} />
					)}
					{step === 5 && workspace && (
						<DoneStep workspaceSlug={workspace.slug} />
					)}
				</div>
			</div>
		</div>
	);
}

/** Row of Back / Skip / primary actions shared by the optional steps. */
function StepActions({
	onBack,
	onSkip,
	children,
}: {
	onBack?: () => void;
	onSkip?: () => void;
	children?: React.ReactNode;
}) {
	const { t } = useTranslation();
	return (
		<div className="mt-6 flex items-center justify-between">
			<div>
				{onBack && (
					<Button type="button" variant="ghost" onClick={onBack}>
						{t("onboarding.back")}
					</Button>
				)}
			</div>
			<div className="flex items-center gap-2">
				{onSkip && (
					<Button type="button" variant="outline" onClick={onSkip}>
						{t("onboarding.skip")}
					</Button>
				)}
				{children}
			</div>
		</div>
	);
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
	return (
		<div className="mb-5">
			<h2 className="font-heading text-lg font-semibold">{title}</h2>
			<p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
		</div>
	);
}

function WorkspaceStep({
	onCreated,
}: {
	onCreated: (ws: { id: string; slug: string }) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	return (
		<>
			<StepHeader
				title={t("onboarding.workspace.title")}
				subtitle={t("onboarding.workspace.subtitle")}
			/>
			<WorkspaceForm
				idPrefix="setup-ws"
				submitLabel={t("onboarding.workspace.submit")}
				onCreated={async (workspace) => {
					// Refresh `me` so the membership is current by the time we finish and
					// navigate into the workspace; the wizard's gate is frozen on mount,
					// so this refetch will not eject us mid-flow.
					await queryClient.invalidateQueries({ queryKey: ["me"] });
					onCreated(workspace);
				}}
			/>
		</>
	);
}

function ProjectStep({
	workspaceId,
	onBack,
	onNext,
}: {
	workspaceId: string;
	onBack: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [error, setError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () =>
			api.createProject(workspaceId, { slug, name, hue: DEFAULT_PROJECT_HUE }),
		onSuccess: () => {
			toast.success(t("onboarding.project.created"));
			onNext();
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<>
			<StepHeader
				title={t("onboarding.project.title")}
				subtitle={t("onboarding.project.subtitle")}
			/>
			<form
				className="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					setError(null);
					mutation.mutate();
				}}
			>
				<div className="flex flex-col gap-2">
					<Label htmlFor="setup-prj-name">{t("settings.projects.name")}</Label>
					<Input
						id="setup-prj-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="setup-prj-slug">{t("settings.slug")}</Label>
					<Input
						id="setup-prj-slug"
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						placeholder={t("settings.projects.slugPlaceholder")}
						pattern="[a-z0-9][a-z0-9-]*"
						required
					/>
				</div>
				{error && <p className="text-destructive text-sm">{error}</p>}
				<StepActions onBack={onBack} onSkip={onNext}>
					<Button type="submit" disabled={mutation.isPending}>
						{t("onboarding.continue")}
					</Button>
				</StepActions>
			</form>
		</>
	);
}

function InstanceStep({
	onBack,
	onNext,
}: {
	onBack: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const email = useQuery({
		queryKey: ["emailSettings"],
		queryFn: () => api.getEmailSettings(),
	});
	const oauth = useQuery({
		queryKey: ["oauthSettings"],
		queryFn: () => api.getOauthSettings(),
	});

	return (
		<>
			<StepHeader
				title={t("onboarding.instance.title")}
				subtitle={t("onboarding.instance.subtitle")}
			/>
			<div className="flex flex-col gap-6">
				{email.data && <EmailSection settings={email.data} />}
				{oauth.data && <OauthSection settings={oauth.data} />}
			</div>
			<StepActions onBack={onBack} onSkip={onNext}>
				<Button
					type="button"
					onClick={async () => {
						// Settings persist via each section's Save; Continue just advances
						// after making sure the cached projections are fresh for later steps.
						await queryClient.invalidateQueries({
							queryKey: ["emailSettings"],
						});
						onNext();
					}}
				>
					{t("onboarding.continue")}
				</Button>
			</StepActions>
		</>
	);
}

function EmailSection({
	settings,
}: {
	settings: { emailEnabled: boolean; emailFromAddress: string | null };
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [enabled, setEnabled] = useState(settings.emailEnabled);
	const [fromAddress, setFromAddress] = useState(
		settings.emailFromAddress ?? "",
	);
	const [error, setError] = useState<string | null>(null);

	const save = useMutation({
		mutationFn: () =>
			api.updateEmailSettings({
				emailEnabled: enabled,
				emailFromAddress: fromAddress.trim() || null,
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["emailSettings"] });
			toast.success(t("onboarding.instance.saved"));
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<section className="flex flex-col gap-3">
			<div>
				<h3 className="text-sm font-semibold">
					{t("onboarding.instance.emailTitle")}
				</h3>
				<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
					{t("onboarding.instance.emailHint")}
				</p>
			</div>
			<label
				className="flex items-center gap-2 text-sm"
				htmlFor="setup-email-enabled"
			>
				<Checkbox
					id="setup-email-enabled"
					checked={enabled}
					onCheckedChange={(v) => setEnabled(v === true)}
				/>
				{t("settings.email.enableLabel")}
			</label>
			{enabled && (
				<div className="flex flex-col gap-2">
					<Label htmlFor="setup-email-from">
						{t("settings.email.fromAddress")}
					</Label>
					<Input
						id="setup-email-from"
						type="email"
						value={fromAddress}
						onChange={(e) => setFromAddress(e.target.value)}
					/>
				</div>
			)}
			{error && <p className="text-destructive text-sm">{error}</p>}
			<div>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					disabled={save.isPending}
					onClick={() => {
						setError(null);
						save.mutate();
					}}
				>
					{t("settings.saveAction")}
				</Button>
			</div>
		</section>
	);
}

function OauthSection({
	settings,
}: {
	settings: {
		google: { enabled: boolean; configured: boolean };
		github: { enabled: boolean; configured: boolean };
	};
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [google, setGoogle] = useState(settings.google.enabled);
	const [github, setGithub] = useState(settings.github.enabled);
	const [error, setError] = useState<string | null>(null);

	const save = useMutation({
		mutationFn: () =>
			api.updateOauthSettings({
				googleOAuthEnabled: google,
				githubOAuthEnabled: github,
			}),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["oauthSettings"] }),
				queryClient.invalidateQueries({ queryKey: ["authProviders"] }),
			]);
			toast.success(t("onboarding.instance.saved"));
		},
		onError: (err: Error) => setError(err.message),
	});

	return (
		<section className="flex flex-col gap-3">
			<h3 className="text-sm font-semibold">
				{t("onboarding.instance.oauthTitle")}
			</h3>
			<ProviderToggle
				id="setup-oauth-google"
				label={t("auth.continueWithGoogle")}
				configured={settings.google.configured}
				checked={google}
				onChange={setGoogle}
			/>
			<ProviderToggle
				id="setup-oauth-github"
				label={t("auth.continueWithGithub")}
				configured={settings.github.configured}
				checked={github}
				onChange={setGithub}
			/>
			{error && <p className="text-destructive text-sm">{error}</p>}
			<div>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					disabled={save.isPending}
					onClick={() => {
						setError(null);
						save.mutate();
					}}
				>
					{t("settings.saveAction")}
				</Button>
			</div>
		</section>
	);
}

function ProviderToggle({
	id,
	label,
	configured,
	checked,
	onChange,
}: {
	id: string;
	label: string;
	configured: boolean;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	const { t } = useTranslation();
	// Hide the toggle only when the provider is both unconfigured and off — there
	// is nothing to enable. If it is somehow already enabled while unconfigured
	// (credentials removed after the fact), still show the toggle so it can be
	// turned off rather than silently resubmitting enabled: true.
	if (!configured && !checked) {
		return (
			<div className="text-sm">
				<span className="font-medium">{label}</span>
				<p className="text-muted-foreground text-xs">
					{t("onboarding.instance.oauthUnconfigured")}
				</p>
			</div>
		);
	}
	return (
		<label className="flex items-center gap-2 text-sm" htmlFor={id}>
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(v) => onChange(v === true)}
			/>
			{label}
		</label>
	);
}

function InviteStep({
	onBack,
	onNext,
}: {
	onBack: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const email = useQuery({
		queryKey: ["emailSettings"],
		queryFn: () => api.getEmailSettings(),
	});
	const emailEnabled = email.data?.emailEnabled ?? false;

	const [address, setAddress] = useState("");
	const [name, setName] = useState("");
	const [grantAdmin, setGrantAdmin] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [generatedPassword, setGeneratedPassword] = useState<string | null>(
		null,
	);
	const [copied, setCopied] = useState(false);

	function reset() {
		setAddress("");
		setName("");
		setGrantAdmin(false);
		setError(null);
	}

	const invite = useMutation({
		mutationFn: () => api.createInvitation({ email: address, grantAdmin }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["invitations"] });
			toast.success(t("onboarding.invite.sent"));
			reset();
		},
		onError: (err: Error) => setError(err.message),
	});

	const create = useMutation({
		mutationFn: () => api.createUser({ email: address, name, grantAdmin }),
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({ queryKey: ["users"] });
			setGeneratedPassword(created.generatedPassword ?? null);
			setCopied(false);
			reset();
		},
		onError: (err: Error) => setError(err.message),
	});

	const submitting = invite.isPending || create.isPending;

	return (
		<>
			<StepHeader
				title={t("onboarding.invite.title")}
				subtitle={
					emailEnabled
						? t("onboarding.invite.subtitleEmail")
						: t("onboarding.invite.subtitleNoEmail")
				}
			/>
			<form
				className="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					setError(null);
					// Branch on the loaded settings, not the `?? false` default: until the
					// query resolves we cannot tell invite-by-email from direct-create, so
					// the submit button is disabled and this guard refuses to act early.
					if (!email.data) return;
					if (email.data.emailEnabled) invite.mutate();
					else create.mutate();
				}}
			>
				<div className="flex flex-col gap-2">
					<Label htmlFor="setup-invite-email">{t("auth.email")}</Label>
					<Input
						id="setup-invite-email"
						type="email"
						value={address}
						onChange={(e) => setAddress(e.target.value)}
						required
					/>
				</div>
				{!emailEnabled && (
					<div className="flex flex-col gap-2">
						<Label htmlFor="setup-invite-name">{t("auth.name")}</Label>
						<Input
							id="setup-invite-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
				)}
				<label
					className="flex items-center gap-2 text-sm"
					htmlFor="setup-invite-admin"
				>
					<Checkbox
						id="setup-invite-admin"
						checked={grantAdmin}
						onCheckedChange={(v) => setGrantAdmin(v === true)}
					/>
					{t("settings.users.grantAdmin")}
				</label>
				{email.isError && (
					<p className="text-destructive text-sm">{t("errors.generic")}</p>
				)}
				{error && <p className="text-destructive text-sm">{error}</p>}
				<div>
					<Button
						type="submit"
						variant="secondary"
						disabled={submitting || !email.data}
					>
						{emailEnabled
							? t("settings.users.inviteAction")
							: t("settings.users.createAction")}
					</Button>
				</div>
			</form>

			{generatedPassword && (
				<div className="border-border bg-muted/50 mt-4 flex flex-col gap-2 rounded-lg border p-4">
					<p className="text-sm font-medium">
						{t("settings.users.generatedTitle")}
					</p>
					<p className="text-muted-foreground text-sm">
						{t("settings.users.generatedDescription")}
					</p>
					<div className="flex items-center gap-2">
						<code className="bg-background flex-1 overflow-x-auto rounded-md px-3 py-2 font-mono text-xs">
							{generatedPassword}
						</code>
						<Button
							type="button"
							variant="outline"
							size="icon"
							aria-label={t("settings.users.copyAction")}
							onClick={async () => {
								await navigator.clipboard.writeText(generatedPassword);
								setCopied(true);
							}}
						>
							{copied ? <CheckIcon /> : <CopyIcon />}
						</Button>
					</div>
				</div>
			)}

			<StepActions onBack={onBack} onSkip={onNext}>
				<Button type="button" onClick={onNext}>
					{t("onboarding.continue")}
				</Button>
			</StepActions>
		</>
	);
}

function DoneStep({ workspaceSlug }: { workspaceSlug: string }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	return (
		<div className="flex flex-col items-center gap-4 py-4 text-center">
			<span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
				<CheckIcon className="size-6" />
			</span>
			<div>
				<h2 className="font-heading text-lg font-semibold">
					{t("onboarding.done.title")}
				</h2>
				<p className="text-muted-foreground mt-1 text-sm">
					{t("onboarding.done.subtitle")}
				</p>
			</div>
			<Button
				onClick={() =>
					navigate({ to: "/w/$wsSlug", params: { wsSlug: workspaceSlug } })
				}
			>
				{t("onboarding.finish")}
			</Button>
		</div>
	);
}
