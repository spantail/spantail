import { createFileRoute } from "@tanstack/react-router";

import { ConnectedAccountsCard } from "@/components/connected-accounts-card";
import { PasswordCard } from "@/components/password-card";

export const Route = createFileRoute("/_authed/settings/sign-in")({
	component: SignInSection,
});

function SignInSection() {
	return (
		<div className="flex flex-col gap-4">
			<PasswordCard />
			<ConnectedAccountsCard />
		</div>
	);
}
