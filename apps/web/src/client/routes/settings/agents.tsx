import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AgentsCard } from "@/components/agents-card";
import { SettingsSection } from "@/components/settings-section";

export const Route = createFileRoute("/settings/agents")({
	component: AgentsSection,
});

function AgentsSection() {
	const { t } = useTranslation();
	return (
		<SettingsSection title={t("settings.nav.agents")}>
			<AgentsCard />
		</SettingsSection>
	);
}
