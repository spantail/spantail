import { createFileRoute, redirect } from "@tanstack/react-router";

// The spans screen moved to home; keep stale bookmarks working.
export const Route = createFileRoute("/_authed/spans")({
	beforeLoad: () => {
		throw redirect({ to: "/" });
	},
});
