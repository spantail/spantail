import { createFileRoute, redirect } from "@tanstack/react-router";

// Preferences moved into the Profile section; keep stale bookmarks working.
export const Route = createFileRoute("/_authed/settings/preferences")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/profile" });
	},
});
