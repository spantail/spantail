import { RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

/**
 * App-wide banner prompting a reload when the running SPA bundle is older than
 * the instance (an old cached bundle talking to a freshly deployed Worker).
 * Reload is manual — never automatic — so in-progress edits are never lost.
 * Rendered (and gated on a version mismatch) by AppFrame in app.tsx, which also
 * reserves its height so it sits above the fixed sidebar; its `min-h-10` must
 * stay in sync with that reservation (`--app-banner-height`).
 */
export function VersionReloadBanner() {
	const { t } = useTranslation();
	return (
		<div className="bg-primary text-primary-foreground flex min-h-10 shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm">
			<span>{t("versionBanner.message")}</span>
			<Button size="sm" variant="secondary" onClick={() => location.reload()}>
				<RefreshCwIcon />
				{t("versionBanner.reload")}
			</Button>
		</div>
	);
}
