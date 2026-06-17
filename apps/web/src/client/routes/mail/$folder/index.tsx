import { createFileRoute } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/mail/$folder/")({
	component: EmptyDetail,
});

function EmptyDetail() {
	const { t } = useTranslation();
	return (
		<div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
			<MailIcon className="size-8 opacity-40" />
			<p className="text-sm">{t("mail.detail.selectPrompt")}</p>
		</div>
	);
}
