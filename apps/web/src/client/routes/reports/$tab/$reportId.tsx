import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { MarkdownView } from "@/components/markdown-view";
import { ReportDiscussion } from "@/components/report-discussion";
import { ReportToolbar } from "@/components/report-toolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

export const Route = createFileRoute("/reports/$tab/$reportId")({
	component: ReportReadingPane,
});

function ReportReadingPane() {
	const { t } = useTranslation();
	const { tab, reportId } = Route.useParams();

	// The list payload is metadata only; fetch the rendered body on open.
	const detail = useQuery({
		queryKey: ["report", reportId],
		queryFn: () => api.getReport(reportId),
	});
	const report = detail.data;

	if (detail.isPending) {
		return (
			<div className="flex h-full min-h-0 flex-col">
				<div className="h-14 shrink-0 border-b" />
				<div className="flex-1 space-y-3 p-8">
					<Skeleton className="h-6 w-1/2" />
					<Skeleton className="h-4 w-1/3" />
					<Skeleton className="mt-6 h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
				</div>
			</div>
		);
	}

	if (detail.isError || !report) {
		return (
			<div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
				{t("reports.detail.notFound")}
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ReportToolbar report={report} tab={tab} />
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-8 py-8">
					{/* The report name is the markdown's own H1 — no extra title header. */}
					<MarkdownView markdown={report.renderedMarkdown} />
					<ReportDiscussion reportId={report.id} />
				</div>
			</div>
		</div>
	);
}
