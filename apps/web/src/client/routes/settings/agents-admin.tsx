import { createFileRoute, redirect } from "@tanstack/react-router";

// The AI agents toggle moved into the Features section; keep stale bookmarks working.
export const Route = createFileRoute("/settings/agents-admin")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/features" });
	},
});
