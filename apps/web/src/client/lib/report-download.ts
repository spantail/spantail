import { formatPeriodLabel, type Report } from "@spantail/core";

/** Saves markdown text to a `.md` file via a transient object URL. */
export function downloadMarkdown(filename: string, markdown: string) {
	const blob = new Blob([markdown], { type: "text/markdown" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

/** Saves a report's markdown as `{report name} {period label}.md`. */
export function downloadReportMarkdown(report: Report) {
	downloadMarkdown(
		`${report.name} ${formatPeriodLabel(report.filters.dateRange)}.md`,
		report.renderedMarkdown,
	);
}
