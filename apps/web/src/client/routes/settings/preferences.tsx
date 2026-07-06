import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AvatarCard } from "@/components/avatar-card";
import { PreferencesCard } from "@/components/preferences-card";
import { SettingsSection } from "@/components/settings-section";

export const Route = createFileRoute("/settings/preferences")({
	component: PreferencesSection,
});

function PreferencesSection() {
	const { t } = useTranslation();
	return (
		<SettingsSection title={t("settings.nav.preferences")}>
			<div className="grid gap-4">
				<AvatarCard />
				<PreferencesCard />
			</div>
		</SettingsSection>
	);
}
