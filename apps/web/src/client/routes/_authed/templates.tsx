import { createFileRoute, redirect } from "@tanstack/react-router";

// Report templates moved into the Settings hub; keep stale bookmarks working.
export const Route = createFileRoute("/_authed/templates")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/templates" });
	},
});
