import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ReportList } from "@/components/report-list";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDocumentTitle } from "@/lib/document-title";

export const Route = createFileRoute("/reports/$tab")({
	component: TabLayout,
});

function TabLayout() {
	const { t } = useTranslation();
	const tab = Route.useParams().tab;
	// Available only when a report child route is active.
	const selected = useParams({
		strict: false,
		select: (p) => p.reportId,
	}) as string | undefined;
	const isMobile = useIsMobile();

	// The open report sets its own title (its name); only the list owns it here.
	useDocumentTitle(selected ? undefined : t("reports.title"));

	// Mobile: single pane driven by the URL — the list, or the open report.
	if (isMobile) {
		return (
			<div className="h-full min-h-0">
				{selected ? <Outlet /> : <ReportList tab={tab} />}
			</div>
		);
	}

	return (
		<ResizablePanelGroup direction="horizontal" className="h-full">
			<ResizablePanel defaultSize={34} minSize={26} maxSize={48}>
				<ReportList tab={tab} selectedId={selected} />
			</ResizablePanel>
			<ResizableHandle hoverHandle />
			<ResizablePanel defaultSize={66} className="min-w-0">
				<Outlet />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
