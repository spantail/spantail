import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";

import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authed/w/$wsSlug")({
	component: WorkspaceLayout,
});

// Resolves the `{wsSlug}` segment against the user's memberships (already loaded
// by AuthedRoot before this renders). An unknown or non-member slug falls back
// to the home hub, which forwards to the active workspace. When the slug
// resolves, the workspace provider derives `current` from the URL, so child
// routes never render with a foreign workspace.
function WorkspaceLayout() {
	const { wsSlug } = Route.useParams();
	const { workspaces } = useWorkspace();
	const exists = workspaces.some((w) => w.slug === wsSlug);

	if (!exists) return <Navigate to="/" replace />;
	return <Outlet />;
}
