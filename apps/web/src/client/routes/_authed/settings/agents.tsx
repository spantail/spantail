import { createFileRoute } from "@tanstack/react-router";

import { AgentsCard } from "@/components/agents-card";

export const Route = createFileRoute("/_authed/settings/agents")({
	component: AgentsSection,
});

function AgentsSection() {
	return <AgentsCard />;
}
