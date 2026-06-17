import { createFileRoute, redirect } from "@tanstack/react-router";

// /mail opens the Inbox.
export const Route = createFileRoute("/mail/")({
	beforeLoad: () => {
		throw redirect({ to: "/mail/$folder", params: { folder: "inbox" } });
	},
});
