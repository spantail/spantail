import {
	formatDuration,
	formatPeriodLabel,
	type ReportFrontMatter,
} from "@spantail/core";
import { useTranslation } from "react-i18next";

/**
 * The rendered version's own YAML front-matter (system provenance), surfaced
 * subtly at the top of the reading pane when "Show header" is toggled on. It
 * reflects the version as generated — muted and compact, never competing with
 * the report body.
 */
export function ReportHeaderMeta({
	frontMatter,
}: {
	frontMatter: ReportFrontMatter | null;
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
		<dl className="text-muted-foreground bg-muted/40 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border px-4 py-3 text-xs print:hidden">
			{items.map((item) => (
				<div key={item.label} className="contents">
					<dt className="font-medium">{item.label}</dt>
					<dd>{item.value}</dd>
				</div>
			))}
		</dl>
	);
}
