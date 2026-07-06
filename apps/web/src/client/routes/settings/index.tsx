import { createFileRoute, redirect } from "@tanstack/react-router";

// The takeover has no landing page of its own; open the first section.
export const Route = createFileRoute("/settings/")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/general" });
	},
});
