import { createFileRoute } from "@tanstack/react-router";

import { TokensCard } from "@/components/tokens-card";

export const Route = createFileRoute("/_authed/settings/tokens")({
	component: TokensSection,
});

function TokensSection() {
	return <TokensCard />;
}
