import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
	SettingsNav,
	settingsSectionLabelKey,
} from "@/components/settings-nav";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/document-title";

export const Route = createFileRoute("/_authed/settings")({
	component: SettingsLayout,
});

// Settings hub: a single screen that gathers the formerly scattered
// management surfaces (workspace, projects, members, templates, tokens)
// behind a left sub-nav. Each section is its own deep-linkable child route.
function SettingsLayout() {
	const { t } = useTranslation();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const labelKey = settingsSectionLabelKey(pathname);
	useDocumentTitle(
		labelKey ? `${t(labelKey)} | ${t("nav.settings")}` : t("settings.title"),
	);
	const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
	const agentsEnabled = useQuery({
		queryKey: ["agents-enabled"],
		queryFn: () => api.getAgentsEnabled(),
	});

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-heading text-xl font-semibold tracking-tight">
					{t("settings.title")}
				</h1>
				<p className="text-muted-foreground mt-0.5 text-sm">
					{t("settings.subtitle")}
				</p>
			</div>
			<div className="flex flex-col gap-6 md:flex-row md:gap-10">
				<SettingsNav
					isAdmin={me.data?.user.isAdmin ?? false}
					canManageTemplates={me.data?.user.canManageTemplates ?? false}
					agentsEnabled={agentsEnabled.data?.enabled ?? false}
				/>
				<div className="min-w-0 flex-1">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
