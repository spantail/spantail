import { createFileRoute, redirect } from "@tanstack/react-router";

// The hub has no landing page of its own; open the first section.
export const Route = createFileRoute("/_authed/settings/")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/general" });
	},
});
