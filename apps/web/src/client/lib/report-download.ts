import { formatPeriodLabel, type ReportSnapshot } from "@toxil/core";

/** Saves a snapshot's markdown as `{report name} {period label}.md`. */
export function downloadSnapshotMarkdown(
	reportName: string,
	snapshot: ReportSnapshot,
) {
	const blob = new Blob([snapshot.renderedMarkdown], {
		type: "text/markdown",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${reportName} ${formatPeriodLabel(snapshot.resolvedFilters.dateRange)}.md`;
	anchor.click();
	URL.revokeObjectURL(url);
}
