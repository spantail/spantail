import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useDocumentTitle } from "@/lib/document-title";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/")({
	component: Home,
});

// The home route is a hub: members are sent to their active (or first)
// workspace dashboard at `/w/{slug}`; an admin who has not created a workspace
// yet is sent to the setup wizard; everyone else (a non-admin with no
// membership) stays here to be told to ask an admin.
function Home() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const { session } = Route.useRouteContext();

	useDocumentTitle(t("nav.home"));

	if (current) {
		return (
			<Navigate to="/w/$wsSlug" params={{ wsSlug: current.slug }} replace />
		);
	}

	// A fresh instance's first user is its admin with no workspace yet: hand them
	// to the onboarding wizard. The wizard owns its own re-entry guard.
	if (session.user.isAdmin) {
		return <Navigate to="/setup" replace />;
	}

	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
			<h2 className="font-heading text-xl font-semibold">
				{t("workspace.empty.title")}
			</h2>
			<p className="text-muted-foreground max-w-md text-sm">
				{t("workspace.empty.member")}
			</p>
		</div>
	);
}
