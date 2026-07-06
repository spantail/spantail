import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Outlet,
	redirect,
	useRouterState,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AuthedRoot } from "@/components/authed-root";
import {
	SettingsSidebar,
	settingsSectionLabelKey,
} from "@/components/settings-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useDocumentTitle } from "@/lib/document-title";
import { SettingsWorkspaceProvider } from "@/lib/settings-workspace";

// Settings is a full-screen takeover, a sibling shell to /reports and
// /messages: the rail replaces the workspace navigation and carries the
// settings menu, headed by the screen title and a Close button back to the
// workspace. Its own auth guard mirrors `_authed`.
export const Route = createFileRoute("/settings")({
	beforeLoad: async () => {
		const { data } = await authClient.getSession();
		if (!data) {
			throw redirect({ to: "/login" });
		}
		return { session: data };
	},
	component: SettingsLayout,
});

function SettingsLayout() {
	const { t } = useTranslation();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const labelKey = settingsSectionLabelKey(pathname);
	useDocumentTitle(
		labelKey ? `${t(labelKey)} | ${t("nav.settings")}` : t("settings.title"),
	);
	const agentsEnabled = useQuery({
		queryKey: ["agents-enabled"],
		queryFn: () => api.getAgentsEnabled(),
	});

	return (
		<AuthedRoot>
			{(me) => (
				<SettingsWorkspaceProvider isAdmin={me.user.isAdmin}>
					<SidebarProvider>
						<SettingsSidebar
							isAdmin={me.user.isAdmin}
							canManageTemplates={me.user.canManageTemplates}
							agentsEnabled={agentsEnabled.data?.enabled ?? false}
						/>
						<SidebarInset className="h-svh overflow-hidden">
							{/* On mobile the sidebar is a closed Sheet; this bar opens it. */}
							<header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:hidden">
								<SidebarTrigger />
								<span className="font-heading text-sm font-semibold tracking-tight">
									{t("settings.title")}
								</span>
							</header>
							<div className="min-h-0 flex-1">
								<Outlet />
							</div>
						</SidebarInset>
					</SidebarProvider>
				</SettingsWorkspaceProvider>
			)}
		</AuthedRoot>
	);
}
