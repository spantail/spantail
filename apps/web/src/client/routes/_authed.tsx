import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppSidebar } from "@/components/app-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { WorkspaceProvider } from "@/lib/workspace";

export const Route = createFileRoute("/_authed")({
	beforeLoad: async () => {
		const { data } = await authClient.getSession();
		if (!data) {
			throw redirect({ to: "/login" });
		}
		return { session: data };
	},
	component: AuthedLayout,
});

function AuthedLayout() {
	const { t } = useTranslation();
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

	return (
		<WorkspaceProvider workspaces={me.data.memberships}>
			<SidebarProvider>
				<AppSidebar user={me.data.user} />
				<SidebarInset>
					<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
						<SidebarTrigger className="-ml-1" />
					</header>
					<main className="flex flex-1 flex-col gap-4 p-4">
						<Outlet />
					</main>
				</SidebarInset>
			</SidebarProvider>
		</WorkspaceProvider>
	);
}
