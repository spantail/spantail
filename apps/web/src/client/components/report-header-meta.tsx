import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

/**
 * The rendered version's own YAML front-matter (system provenance), surfaced at
 * the top of the reading pane when "Show header" is toggled on. It shows the
 * whole, validated header verbatim as structured YAML — nothing hand-picked or
 * reformatted — so every field (all workspace ids, the preset, etc.) is visible.
 * `frontMatter` is already validated and sanitized by
 * `renderReportFrontMatterYaml`; it is rendered as a plain text node (never raw
 * HTML). Null when the version carries no system header. `onClose` dismisses it
 * (same effect as toggling the header off from the toolbar).
 */
export function ReportHeaderMeta({
	frontMatter,
	onClose,
}: {
	frontMatter: string | null;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	if (!frontMatter) return null;

	return (
		<div className="text-muted-foreground bg-muted/40 relative rounded-md border px-4 py-3 print:hidden">
			<Button
				variant="ghost"
				size="icon"
				className="text-muted-foreground absolute top-1.5 right-1.5 size-6"
				aria-label={t("reports.toolbar.hideHeader")}
				title={t("reports.toolbar.hideHeader")}
				onClick={onClose}
			>
				<XIcon />
			</Button>
			<pre className="overflow-x-auto pr-6 font-mono text-xs whitespace-pre">
				{frontMatter}
			</pre>
		</div>
	);
}
