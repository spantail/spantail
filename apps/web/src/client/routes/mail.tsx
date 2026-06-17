import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AuthedRoot } from "@/components/authed-root";
import { MailSidebar } from "@/components/mail-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

// The mailbox is a sibling shell to the workspace chrome: report sharing spans
// workspaces (user-scoped), so it gets its own folder sidebar instead of the
// workspace navigation. Its own auth guard mirrors `_authed`.
export const Route = createFileRoute("/mail")({
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
	return (
		<AuthedRoot>
			{() => (
				<SidebarProvider>
					<MailSidebar />
					<SidebarInset className="h-svh overflow-hidden">
						<Outlet />
					</SidebarInset>
				</SidebarProvider>
			)}
		</AuthedRoot>
	);
}
