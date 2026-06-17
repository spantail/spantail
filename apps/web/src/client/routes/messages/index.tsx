import { createFileRoute, redirect } from "@tanstack/react-router";

// /messages opens the Inbox.
export const Route = createFileRoute("/messages/")({
	beforeLoad: () => {
		throw redirect({ to: "/messages/$folder", params: { folder: "inbox" } });
	},
});
