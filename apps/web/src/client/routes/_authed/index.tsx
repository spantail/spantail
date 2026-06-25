import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/lib/document-title";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/")({
	component: Home,
});

// The home route is a hub: members are sent to their active (or first)
// workspace dashboard at `/w/{slug}`; only users with no membership stay here
// to see the onboarding screen.
function Home() {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const { session } = Route.useRouteContext();
	const [createOpen, setCreateOpen] = useState(false);

	useDocumentTitle(t("nav.home"));

	if (current) {
		return (
			<Navigate to="/w/$wsSlug" params={{ wsSlug: current.slug }} replace />
		);
	}

	const isAdmin = Boolean(session.user.isAdmin);
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
			<h2 className="font-heading text-xl font-semibold">
				{t("workspace.empty.title")}
			</h2>
			<p className="text-muted-foreground max-w-md text-sm">
				{isAdmin ? t("workspace.empty.admin") : t("workspace.empty.member")}
			</p>
			{isAdmin && (
				<>
					<Button className="mt-2" onClick={() => setCreateOpen(true)}>
						{t("workspace.createAction")}
					</Button>
					<CreateWorkspaceDialog
						open={createOpen}
						onOpenChange={setCreateOpen}
					/>
				</>
			)}
		</div>
	);
}
