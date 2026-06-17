import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { formatPeriodLabel, type MailFolder } from "@toxil/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { MailToolbar } from "@/components/mail-toolbar";
import { MarkdownView } from "@/components/markdown-view";
import { ReportDiscussion } from "@/components/report-discussion";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { invalidateMail } from "@/lib/query";

export const Route = createFileRoute("/mail/$folder/$messageId")({
	component: ReadingPane,
});

function ReadingPane() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { folder, messageId } = Route.useParams();
	const folderTyped = folder as MailFolder;

	const detail = useQuery({
		queryKey: ["mail-message", messageId],
		queryFn: () => api.getInboxMessage(messageId),
	});
	const data = detail.data;

	// Mark a received message read on open; refreshes the unread dot and badge.
	useEffect(() => {
		if (data && data.scope === "received" && data.readAt === null) {
			api.markInboxRead(messageId).then(() => invalidateMail(queryClient));
		}
	}, [data, messageId, queryClient]);

	if (detail.isPending) {
		return (
			<div className="flex h-full min-h-0 flex-col">
				<div className="h-12 shrink-0 border-b" />
				<div className="flex-1 space-y-3 p-6">
					<Skeleton className="h-6 w-1/2" />
					<Skeleton className="h-4 w-1/3" />
					<Skeleton className="mt-6 h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
				</div>
			</div>
		);
	}

	if (detail.isError || !data) {
		return (
			<div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
				{t("mail.detail.notFound")}
			</div>
		);
	}

	const subline =
		data.scope === "sent"
			? t("mail.list.to", { names: data.recipientNames.join(", ") })
			: t("notifications.from", { name: data.senderName });

	return (
		<div className="flex h-full min-h-0 flex-col">
			<MailToolbar item={data} folder={folderTyped} />
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-3xl px-6 py-6">
					<h1 className="font-heading text-xl font-semibold tracking-tight">
						{data.reportName}
					</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						<span>{subline}</span>
						<span className="mx-1.5">·</span>
						<span className="tabular-nums">
							{formatPeriodLabel({ from: data.dateFrom, to: data.dateTo })}
						</span>
					</p>
					{data.message && (
						<p className="bg-muted/50 mt-4 rounded-lg border px-3 py-2 text-sm">
							{data.message}
						</p>
					)}
					<div className="mt-6">
						<MarkdownView markdown={data.renderedMarkdown} />
					</div>
					{data.reportId && (
						<div className="mt-8">
							<ReportDiscussion reportId={data.reportId} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
