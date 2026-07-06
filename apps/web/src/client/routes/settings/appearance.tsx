import { createFileRoute, redirect } from "@tanstack/react-router";

// Appearance moved into the General section; keep stale bookmarks working.
export const Route = createFileRoute("/settings/appearance")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/general" });
	},
});
