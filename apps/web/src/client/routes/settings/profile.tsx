import { createFileRoute, redirect } from "@tanstack/react-router";

// Profile was renamed to Preferences; keep stale bookmarks working.
export const Route = createFileRoute("/settings/profile")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/preferences" });
	},
});
