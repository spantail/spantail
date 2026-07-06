import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AuthedRoot } from "@/components/authed-root";
import { MailSidebar } from "@/components/mail-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

// The mailbox is a sibling shell to the workspace chrome: report sharing spans
// workspaces (user-scoped), so it gets its own folder sidebar instead of the
// workspace navigation. Its own auth guard mirrors `_authed`.
export const Route = createFileRoute("/messages")({
	beforeLoad: async () => {
		const { data } = await authClient.getSession();
		if (!data) {
			throw redirect({ to: "/login" });
		}
		return { session: data };
	},
	component: MailLayout,
});

function MailLayout() {
	const { t } = useTranslation();
	return (
		<AuthedRoot>
			{() => (
				<SidebarProvider>
					<MailSidebar />
					<SidebarInset className="h-svh overflow-hidden">
						{/* On mobile the sidebar is a closed Sheet; this bar is the only
						    way to open it (folders + the Close action). */}
						<header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:hidden">
							<SidebarTrigger />
							<span className="font-heading text-sm font-semibold tracking-tight">
								{t("messages.title")}
							</span>
						</header>
						<div className="min-h-0 flex-1">
							<Outlet />
						</div>
					</SidebarInset>
				</SidebarProvider>
			)}
		</AuthedRoot>
	);
}
