import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/components/settings-section";
import { SpantailMark } from "@/components/spantail-mark";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";

export const Route = createFileRoute("/settings/system")({
	component: SystemSection,
});

const REPO_URL = "https://github.com/spantail/spantail";

// Link to the matching GitHub Release for a clean `vX.Y.Z` build; off-tag
// builds (e.g. "v0.1.0-7-gfe9cc5b" or "unknown") have no exact release, so
// point at the releases list instead.
function releaseUrl(version: string): string {
	return /^v\d+\.\d+\.\d+$/.test(version)
		? `${REPO_URL}/releases/tag/${version}`
		: `${REPO_URL}/releases`;
}

function SystemSection() {
	const { t } = useTranslation();
	return (
		<SettingsSection title={t("settings.nav.systemAbout")}>
			<div className="flex flex-col gap-4">
				<UpdateNotice />
				<SystemContent />
			</div>
		</SettingsSection>
	);
}

// Admin-only: nudges instance admins when a newer Spantail has been released
// upstream. The check is admin-gated server-side and cached (long client
// staleTime + edge cache), so it runs at most occasionally when this page is
// viewed. Renders nothing for non-admins, when up to date, or when the upstream
// check is unavailable.
function UpdateNotice() {
	const { t } = useTranslation();
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
	const isAdmin = me.data?.user.isAdmin ?? false;
	const version = useQuery({
		queryKey: ["instance-version"],
		queryFn: () => api.getInstanceVersion(),
		enabled: isAdmin,
		staleTime: 60 * 60 * 1000,
	});

	const latest = version.data?.latest;
	if (!version.data?.updateAvailable || !latest) return null;

	return (
		<div className="border-border bg-card flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm leading-relaxed">
			<ArrowUpCircleIcon className="text-muted-foreground mt-0.5 size-[18px] shrink-0" />
			<p className="text-muted-foreground">
				<span className="text-foreground font-medium">
					{t("settings.system.updateAvailableTitle")}
				</span>{" "}
				{t("settings.system.updateAvailableBody", { latest })}{" "}
				<a
					href={releaseUrl(latest)}
					target="_blank"
					rel="noopener noreferrer"
					className="text-foreground decoration-border hover:decoration-foreground font-medium whitespace-nowrap underline underline-offset-4 transition-colors"
				>
					{t("settings.system.viewRelease")}
				</a>
			</p>
		</div>
	);
}

function SystemContent() {
	const { t } = useTranslation();
	const version = __APP_VERSION__;
	const year = new Date().getFullYear();

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-3">
					<SpantailMark size={36} />
					<div>
						<CardTitle className="font-heading text-base">
							{t("app.name")}
						</CardTitle>
						<CardDescription>
							{t("settings.system.description")}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<dl className="flex flex-col gap-3 text-sm">
					<div className="flex items-center justify-between gap-4">
						<dt className="text-muted-foreground">
							{t("settings.system.versionLabel")}
						</dt>
						<dd>
							<a
								href={releaseUrl(version)}
								target="_blank"
								rel="noopener noreferrer"
								className="font-medium underline-offset-4 hover:underline"
							>
								{version}
							</a>
						</dd>
					</div>
					<div className="flex items-center justify-between gap-4">
						<dt className="text-muted-foreground">
							{t("settings.system.copyrightLabel")}
						</dt>
						<dd>
							<a
								href="https://spantail.com"
								target="_blank"
								rel="noopener noreferrer"
								className="underline-offset-4 hover:underline"
							>
								© {year} {t("app.name")}
							</a>
						</dd>
					</div>
				</dl>
			</CardContent>
		</Card>
	);
}
