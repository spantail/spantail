import { formatPeriodLabel, type Report } from "@toxil/core";

/** Saves a report's markdown as `{report name} {period label}.md`. */
export function downloadReportMarkdown(report: Report) {
	const blob = new Blob([report.renderedMarkdown], {
		type: "text/markdown",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${report.name} ${formatPeriodLabel(report.filters.dateRange)}.md`;
	anchor.click();
	URL.revokeObjectURL(url);
}
