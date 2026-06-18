import { createFileRoute } from "@tanstack/react-router";

import { ConnectedAccountsCard } from "@/components/connected-accounts-card";
import { PasswordCard } from "@/components/password-card";

export const Route = createFileRoute("/_authed/settings/authentication")({
	component: AuthenticationSection,
});

function AuthenticationSection() {
	return (
		<div className="flex flex-col gap-4">
			<PasswordCard />
			<ConnectedAccountsCard />
		</div>
	);
}
