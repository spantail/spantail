import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { SpantailMark } from "@/components/spantail-mark";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_authed/settings/system")({
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
