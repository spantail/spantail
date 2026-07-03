import { createFileRoute } from "@tanstack/react-router";

import { AvatarCard } from "@/components/avatar-card";
import { PreferencesCard } from "@/components/preferences-card";

export const Route = createFileRoute("/_authed/settings/profile")({
	component: ProfileSection,
});

function ProfileSection() {
	return (
		<div className="grid gap-4">
			<AvatarCard />
			<PreferencesCard />
		</div>
	);
}
