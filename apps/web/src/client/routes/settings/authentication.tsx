import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ConnectedAccountsCard } from "@/components/connected-accounts-card";
import { PasswordCard } from "@/components/password-card";
import { SettingsSection } from "@/components/settings-section";

export const Route = createFileRoute("/settings/authentication")({
	component: AuthenticationSection,
});

function AuthenticationSection() {
	const { t } = useTranslation();
	return (
		<SettingsSection title={t("settings.nav.authentication")}>
			<div className="flex flex-col gap-4">
				<PasswordCard />
				<ConnectedAccountsCard />
			</div>
		</SettingsSection>
	);
}
