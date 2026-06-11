import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const { t } = useTranslation();
	return (
		<div className="flex min-h-svh items-center justify-center">
			<h1 className="font-heading text-2xl font-semibold">{t("auth.login")}</h1>
		</div>
	);
}
