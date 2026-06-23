import { createFileRoute } from "@tanstack/react-router";

import { AvatarCard } from "@/components/avatar-card";

export const Route = createFileRoute("/_authed/settings/profile")({
	component: ProfileSection,
});

function ProfileSection() {
	return <AvatarCard />;
}
