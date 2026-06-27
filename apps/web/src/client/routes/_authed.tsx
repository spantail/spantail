import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { FileChartColumnIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AppSidebar } from "@/components/app-sidebar";
import { AuthedRoot } from "@/components/authed-root";
import { EntryDialogProvider, useEntryDialog } from "@/components/entry-dialog";
import { NavInbox } from "@/components/nav-inbox";
import { NavUser } from "@/components/nav-user";
import { SearchCommand } from "@/components/search-command";
import { Button } from "@/components/ui/button";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { useWorkspace } from "@/lib/workspace";

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

	return (
		<AuthedRoot>
			{(me) => (
				<EntryDialogProvider>
					<SidebarProvider>
						<AppSidebar isAdmin={me.user.isAdmin} />
						<SidebarInset>
							<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
								<SidebarTrigger className="-ml-1" />
								{/* Top-right corner is the user-scoped zone: reports span
								    workspaces, so they live here, not in the sidebar. */}
								<div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
									<SearchCommand />
									<LogWorkButton />
									<Button
										asChild
										variant="ghost"
										size="sm"
										className="h-8 text-muted-foreground text-xs"
									>
										<Link
											to="/reports"
											aria-label={t("nav.reports")}
											activeProps={{
												className: "bg-accent text-accent-foreground",
											}}
										>
											<FileChartColumnIcon />
											<span className="hidden sm:inline">
												{t("nav.reports")}
											</span>
										</Link>
									</Button>
									<NavInbox />
									<NavUser user={me.user} />
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
			)}
		</AuthedRoot>
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
			className="h-8 text-xs"
			aria-label={t("nav.logWork")}
			onClick={() => openCreate()}
		>
			<PlusIcon />
			<span className="hidden sm:inline">{t("nav.logWork")}</span>
		</Button>
	);
}
