import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { ArchiveIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/w/$wsSlug")({
	component: WorkspaceLayout,
});

// Resolves the `{wsSlug}` segment against the user's memberships (already loaded
// by AuthedRoot before this renders). An unknown or non-member slug falls back
// to the home hub, which forwards to the active workspace. When the slug
// resolves, the workspace provider derives `current` from the URL, so child
// routes never render with a foreign workspace. An archived workspace stays
// readable (reached by URL — the switcher hides it) behind a read-only banner.
function WorkspaceLayout() {
	const { t } = useTranslation();
	const { wsSlug } = Route.useParams();
	const { workspaces } = useWorkspace();
	const workspace = workspaces.find((w) => w.slug === wsSlug);

	if (!workspace) return <Navigate to="/" replace />;
	return (
		<>
			{workspace.archivedAt && (
				<div className="flex items-center gap-2 border-amber-500/30 border-b bg-amber-500/10 px-4 py-2 text-amber-700 text-sm dark:text-amber-400">
					<ArchiveIcon className="size-4 shrink-0" />
					{t("workspace.archivedBanner")}
				</div>
			)}
			<Outlet />
		</>
	);
}
