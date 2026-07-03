import { createFileRoute, redirect } from "@tanstack/react-router";

// Email settings moved into the Features section; keep stale bookmarks working.
export const Route = createFileRoute("/_authed/settings/email")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/features" });
	},
});
