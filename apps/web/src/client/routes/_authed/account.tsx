import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { TokensCard } from "@/components/tokens-card";

export const Route = createFileRoute("/_authed/account")({
	component: AccountPage,
});

function AccountPage() {
	const { t } = useTranslation();

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<h1 className="font-heading text-lg font-semibold">{t("nav.account")}</h1>
			<TokensCard />
		</div>
	);
}
