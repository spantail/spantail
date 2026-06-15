import { createFileRoute, redirect } from "@tanstack/react-router";

// The account/tokens page moved into the Settings hub; keep stale bookmarks working.
export const Route = createFileRoute("/_authed/account")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/tokens" });
	},
});
