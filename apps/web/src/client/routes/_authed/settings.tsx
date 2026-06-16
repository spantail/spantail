import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { SettingsNav } from "@/components/settings-nav";

export const Route = createFileRoute("/_authed/settings")({
	component: SettingsLayout,
});

// Settings hub: a single screen that gathers the formerly scattered
// management surfaces (workspace, projects, members, templates, tokens)
// behind a left sub-nav. Each section is its own deep-linkable child route.
function SettingsLayout() {
	const { t } = useTranslation();

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
				<SettingsNav />
				<div className="min-w-0 flex-1">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
