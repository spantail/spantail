import { createFileRoute } from "@tanstack/react-router";

import { PreferencesCard } from "@/components/preferences-card";

export const Route = createFileRoute("/_authed/settings/preferences")({
	component: PreferencesSection,
});

function PreferencesSection() {
	return <PreferencesCard />;
}
