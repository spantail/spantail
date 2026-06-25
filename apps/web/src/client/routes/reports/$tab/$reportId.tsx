import { type Report, splitFrontMatter } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CopyMarkdownButton } from "@/components/copy-markdown-button";
import { MarkdownView } from "@/components/markdown-view";
import { ReportDeleteAction } from "@/components/report-delete-action";
import { ReportDiscussion } from "@/components/report-discussion";
import { ReportToolbar } from "@/components/report-toolbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/document-title";

export const Route = createFileRoute("/reports/$tab/$reportId")({
	component: ReportReadingPane,
});

function ReportReadingPane() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { tab, reportId } = Route.useParams();

	// The list payload is metadata only; fetch the rendered body on open.
	const detail = useQuery({
		queryKey: ["report", reportId],
		queryFn: () => api.getReport(reportId),
	});
	const report = detail.data;

	useDocumentTitle(report?.name);

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
		// A report stays listed (and owner-deletable) after the owner loses
		// membership in a filtered workspace, but its content can no longer be
		// read. Keep Close + Delete reachable so it isn't stranded in the list.
		const close = () => navigate({ to: "/reports/$tab", params: { tab } });
		return (
			<div className="flex h-full min-h-0 flex-col">
				<div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
					<Button
						variant="ghost"
						size="icon"
						className="size-9"
						aria-label={t("reports.toolbar.close")}
						title={t("reports.toolbar.close")}
						onClick={close}
					>
						<XIcon />
					</Button>
					<div className="bg-border mx-1 h-5 w-px" aria-hidden />
					<ReportDeleteAction reportId={reportId} onDeleted={close} />
				</div>
				<div className="text-muted-foreground flex flex-1 items-center justify-center px-6 text-center text-sm">
					{t("reports.detail.notFound")}
				</div>
			</div>
		);
	}

	return <ReportPane key={report.id} report={report} tab={tab} />;
}

function ReportPane({ report, tab }: { report: Report; tab: string }) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<ReportToolbar report={report} tab={tab} />
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-8 py-8">
					{/* The report name is the markdown's own H1 — no title header.
					    The YAML front-matter header is stripped by MarkdownView.
					    `print-area` scopes the Print action to the preview only. */}
					<div className="print-area relative">
						<CopyMarkdownButton
							markdown={splitFrontMatter(report.renderedMarkdown).body}
							className="absolute top-0 right-0 print:hidden"
						/>
						<MarkdownView markdown={report.renderedMarkdown} variant="report" />
					</div>
					<ReportDiscussion reportId={report.id} />
				</div>
			</div>
		</div>
	);
}
