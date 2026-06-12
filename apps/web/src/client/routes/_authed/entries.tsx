import { createFileRoute, redirect } from "@tanstack/react-router";

// The entries screen moved to home; keep stale bookmarks working.
export const Route = createFileRoute("/_authed/entries")({
	beforeLoad: () => {
		throw redirect({ to: "/" });
	},
});
