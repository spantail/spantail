import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authed/")({
	component: Home,
});

function Home() {
	const { t } = useTranslation();
	return (
		<div className="flex min-h-svh items-center justify-center">
			<p className="text-muted-foreground">{t("app.loading")}</p>
		</div>
	);
}
