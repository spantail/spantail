import { createFileRoute } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/mail/$folder/")({
	component: EmptyDetail,
});

function EmptyDetail() {
	const { t } = useTranslation();
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
			<div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-2xl">
				<InboxIcon className="size-6" />
			</div>
			<p className="text-muted-foreground text-sm">
				{t("mail.detail.selectPrompt")}
			</p>
		</div>
	);
}
