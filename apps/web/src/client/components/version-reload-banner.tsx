import { RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useVersionMismatch } from "@/lib/server-version";

/**
 * App-wide banner prompting a reload when the running SPA bundle is older than
 * the instance (an old cached bundle talking to a freshly deployed Worker).
 * Reload is manual — never automatic — so in-progress edits are never lost.
 * Renders nothing until a version mismatch is detected.
 */
export function VersionReloadBanner() {
	const { t } = useTranslation();
	const mismatch = useVersionMismatch();
	if (!mismatch) return null;

	return (
		<div className="bg-primary text-primary-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm">
			<span>{t("versionBanner.message")}</span>
			<Button size="sm" variant="secondary" onClick={() => location.reload()}>
				<RefreshCwIcon />
				{t("versionBanner.reload")}
			</Button>
		</div>
	);
}
