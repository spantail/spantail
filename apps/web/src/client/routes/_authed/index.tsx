import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/")({
	component: Home,
});

// Temporary landing screen; replaced by the app shell in the next step.
function Home() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { session } = Route.useRouteContext();

	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-4">
			<p className="text-muted-foreground">{session.user.email}</p>
			<Button
				variant="outline"
				onClick={async () => {
					await authClient.signOut();
					await navigate({ to: "/login" });
				}}
			>
				{t("auth.logout")}
			</Button>
		</div>
	);
}
