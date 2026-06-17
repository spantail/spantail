import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { FileChartColumnIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AppSidebar } from "@/components/app-sidebar";
import { EntryDialogProvider, useEntryDialog } from "@/components/entry-dialog";
import { NavInbox } from "@/components/nav-inbox";
import { NavUser } from "@/components/nav-user";
import { Button } from "@/components/ui/button";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useWorkspace, WorkspaceProvider } from "@/lib/workspace";

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
			<EntryDialogProvider>
				<SidebarProvider>
					<AppSidebar isAdmin={me.data.user.isAdmin} />
					<SidebarInset>
						<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
							<SidebarTrigger className="-ml-1" />
							{/* Top-right corner is the user-scoped zone: reports span
							    workspaces, so they live here, not in the sidebar. */}
							<div className="ml-auto flex items-center gap-1">
								<LogWorkButton />
								<Button
									asChild
									variant="ghost"
									size="sm"
									className="text-muted-foreground text-xs"
								>
									<Link
										to="/reports"
										aria-label={t("nav.reports")}
										activeProps={{
											className: "bg-accent text-accent-foreground",
										}}
									>
										<FileChartColumnIcon />
										<span className="hidden sm:inline">{t("nav.reports")}</span>
									</Link>
								</Button>
								<NavInbox />
								<NavUser user={me.data.user} />
							</div>
						</header>
						<main className="flex flex-1 flex-col">
							<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
								<Outlet />
							</div>
						</main>
					</SidebarInset>
				</SidebarProvider>
			</EntryDialogProvider>
		</WorkspaceProvider>
	);
}

function LogWorkButton() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const { openCreate } = useEntryDialog();

	if (!current) return null;
	return (
		<Button
			size="sm"
			className="text-xs"
			aria-label={t("nav.logWork")}
			onClick={() => openCreate()}
		>
			<PlusIcon />
			<span className="hidden sm:inline">{t("nav.logWork")}</span>
		</Button>
	);
}
