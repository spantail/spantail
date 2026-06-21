import { createFileRoute } from "@tanstack/react-router";

import { AppearanceCard } from "@/components/appearance-card";

export const Route = createFileRoute("/_authed/settings/appearance")({
	component: AppearanceSection,
});

function AppearanceSection() {
	return <AppearanceCard />;
}
