import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AuthedRoot } from "@/components/authed-root";
import { ReportDialogsProvider } from "@/components/report-dialogs";
import { ReportsSidebar } from "@/components/reports-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

// Optional seed for the create dialog, set by deep links from outside the
// reports shell (e.g. the home timeline's "create daily report" button).
// ReportDialogsProvider consumes and then clears these.
export interface ReportsSearch {
	create?: string;
	from?: string;
	to?: string;
	/** Originating workspace, so the seeded report stays scoped to it. */
	ws?: string;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}

// Reports are user-scoped and span workspaces, so they get their own mailbox
// shell (folder sidebar) instead of the workspace navigation — a sibling to
// /messages. Its own auth guard mirrors `_authed`.
export const Route = createFileRoute("/reports")({
	validateSearch: (search: Record<string, unknown>): ReportsSearch => ({
		create: asString(search.create),
		from: asString(search.from),
		to: asString(search.to),
		ws: asString(search.ws),
	}),
	beforeLoad: async () => {
		const { data } = await authClient.getSession();
		if (!data) {
			throw redirect({ to: "/login" });
		}
		return { session: data };
	},
	component: ReportsLayout,
});

function ReportsLayout() {
	const { t } = useTranslation();
	return (
		<AuthedRoot>
			{() => (
				<ReportDialogsProvider>
					<SidebarProvider>
						<ReportsSidebar />
						<SidebarInset className="h-svh overflow-hidden">
							{/* On mobile the sidebar is a closed Sheet; this bar opens it. */}
							<header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:hidden">
								<SidebarTrigger />
								<span className="font-heading text-sm font-semibold tracking-tight">
									{t("reports.title")}
								</span>
							</header>
							<div className="min-h-0 flex-1">
								<Outlet />
							</div>
						</SidebarInset>
					</SidebarProvider>
				</ReportDialogsProvider>
			)}
		</AuthedRoot>
	);
}
