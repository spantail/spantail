import { createFileRoute, redirect } from "@tanstack/react-router";

// /reports opens the All view.
export const Route = createFileRoute("/reports/")({
	beforeLoad: () => {
		throw redirect({ to: "/reports/$tab", params: { tab: "all" } });
	},
});
