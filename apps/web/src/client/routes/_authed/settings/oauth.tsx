import { createFileRoute, redirect } from "@tanstack/react-router";

// Social login settings moved into the Features section; keep stale bookmarks working.
export const Route = createFileRoute("/_authed/settings/oauth")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/features" });
	},
});
