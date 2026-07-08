import { RotateCwIcon, XIcon } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { dismissReloadBanner } from "@/lib/server-version";

/**
 * App-wide banner prompting a reload when the running SPA bundle is older than
 * the instance (an old cached bundle talking to a freshly deployed Worker).
 * Reload is manual — never automatic — so in-progress edits are never lost.
 * Non-critical, so it stays quiet: a single neutral bar, dismissible until the
 * next deploy. Rendered (and gated) by AppFrame in app.tsx, which measures this
 * bar's height to reserve space so it sits above the fixed sidebar.
 */
export function VersionReloadBanner() {
	const { t } = useTranslation();
	return (
		<div className="border-border bg-secondary text-foreground relative flex min-h-11 shrink-0 items-center justify-center gap-3 border-b px-14 py-2 text-sm">
			<span className="text-center">
				<Trans
					i18nKey="versionBanner.message"
					values={{ name: t("app.name") }}
					components={{ b: <span className="font-semibold" /> }}
				/>
			</span>
			<Button
				size="sm"
				variant="outline"
				className="bg-card"
				onClick={() => location.reload()}
			>
				<RotateCwIcon />
				{t("versionBanner.reload")}
			</Button>
			<button
				type="button"
				aria-label={t("versionBanner.dismiss")}
				onClick={dismissReloadBanner}
				className="text-muted-foreground hover:bg-accent hover:text-foreground absolute top-1/2 right-3 flex size-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
			>
				<XIcon className="size-[15px]" />
			</button>
		</div>
	);
}
