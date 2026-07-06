import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { SettingsSection } from "@/components/settings-section";
import { TokensCard } from "@/components/tokens-card";

export const Route = createFileRoute("/settings/tokens")({
	component: TokensSection,
});

function TokensSection() {
	const { t } = useTranslation();
	return (
		<SettingsSection title={t("settings.nav.tokens")}>
			<TokensCard />
		</SettingsSection>
	);
}
