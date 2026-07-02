import {
	formatDuration,
	formatPeriodLabel,
	type ReportFrontMatter,
} from "@spantail/core";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

/**
 * The rendered version's own YAML front-matter (system provenance), surfaced
 * subtly at the top of the reading pane when "Show header" is toggled on. It
 * reflects the version as generated — muted and compact, never competing with
 * the report body. `onClose` dismisses it (same effect as toggling the header
 * off from the toolbar).
 */
export function ReportHeaderMeta({
	frontMatter,
	onClose,
}: {
	frontMatter: ReportFrontMatter | null;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	if (!frontMatter) return null;

	const { filters } = frontMatter;
	const items: { label: string; value: string }[] = [
		{
			label: t("reports.header.period"),
			value: formatPeriodLabel({
				from: frontMatter.period.from,
				to: frontMatter.period.to,
			}),
		},
		{
			label: t("reports.header.total"),
			value: formatDuration(frontMatter.totalMinutes),
		},
		{
			label: t("reports.header.workspaces"),
			value: String(filters.workspaceIds.length),
		},
	];
	if (filters.projectIds?.length) {
		items.push({
			label: t("reports.header.projects"),
			value: String(filters.projectIds.length),
		});
	}
	if (filters.userIds?.length) {
		items.push({
			label: t("reports.header.users"),
			value: String(filters.userIds.length),
		});
	}
	if (filters.tags?.length) {
		items.push({
			label: t("reports.header.tags"),
			value: filters.tags.join(", "),
		});
	}
	items.push(
		{ label: t("reports.header.timezone"), value: frontMatter.timezone },
		{
			label: t("reports.header.generatedAt"),
			value: new Date(frontMatter.generatedAt).toLocaleString(),
		},
		{ label: t("reports.header.version"), value: String(frontMatter.version) },
	);

	return (
		<div className="text-muted-foreground bg-muted/40 relative rounded-md border px-4 py-3 text-xs print:hidden">
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
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pr-6">
				{items.map((item) => (
					<div key={item.label} className="contents">
						<dt className="font-medium">{item.label}</dt>
						<dd>{item.value}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
