import { ShieldIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

// Context banner shown above instance-wide (System) settings so admins know the
// change applies to every workspace, not just the current one. Mirrors the
// design's AdminBanner. `body` is the section-specific explanation; the leading
// "Instance administration." phrase is shared across System panels.
export function AdminBanner({ body }: { body: string }) {
	const { t } = useTranslation();
	return (
		<div className="border-border bg-muted/40 flex items-start gap-2.5 rounded-xl border px-4 py-3">
			<span className="bg-secondary text-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
				<ShieldIcon className="size-[15px]" />
			</span>
			<p className="text-muted-foreground text-sm">
				<span className="text-foreground font-medium">
					{t("settings.adminBannerLead")}{" "}
				</span>
				{body}
			</p>
		</div>
	);
}
