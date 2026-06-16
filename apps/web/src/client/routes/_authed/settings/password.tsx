import { createFileRoute } from "@tanstack/react-router";

import { PasswordCard } from "@/components/password-card";

export const Route = createFileRoute("/_authed/settings/password")({
	component: PasswordSection,
});

function PasswordSection() {
	return <PasswordCard />;
}
