import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { formatPeriodLabel, type MailFolder } from "@toxil/core";
import { DownloadIcon, FileTextIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { MailToolbar } from "@/components/mail-toolbar";
import { MarkdownView } from "@/components/markdown-view";
import { PersonAvatar } from "@/components/person-avatar";
import { ReportDiscussion } from "@/components/report-discussion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { invalidateMail } from "@/lib/query";
import { downloadMarkdown } from "@/lib/report-download";

export const Route = createFileRoute("/mail/$folder/$messageId")({
	component: ReadingPane,
});

function ReadingPane() {
	const { t, i18n } = useTranslation();
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
				<div className="h-14 shrink-0 border-b" />
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

	const isSent = data.scope === "sent";
	// Header byline: recipient(s) for a sent batch, the sender for a received copy.
	const personName = isSent ? (data.recipientNames[0] ?? "?") : data.senderName;
	const personLabel = isSent
		? t("mail.list.to", { names: data.recipientNames.join(", ") })
		: data.senderName;
	const email = isSent ? undefined : data.senderEmail;
	const period = formatPeriodLabel({ from: data.dateFrom, to: data.dateTo });

	return (
		<div className="flex h-full min-h-0 flex-col">
			<MailToolbar item={data} folder={folderTyped} />
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-8 py-8">
					{/* byline — the report name is rendered by the markdown body */}
					<header className="flex flex-col gap-4">
						<div className="flex items-center gap-3">
							<PersonAvatar name={personName} size={40} />
							<div className="min-w-0 flex-1">
								<div className="flex items-baseline gap-1.5 text-sm">
									<span className="text-foreground font-medium">
										{personLabel}
									</span>
									{email && (
										<span className="text-muted-foreground truncate">
											· {email}
										</span>
									)}
								</div>
								<div className="text-muted-foreground mt-0.5 text-xs">
									{formatRelativeTime(data.createdAt, i18n.language)}
								</div>
							</div>
						</div>
					</header>

					{/* the human note, quoted */}
					{data.message && (
						<p className="border-border text-foreground/80 border-l-2 pl-4 text-[15px] leading-relaxed">
							{data.message}
						</p>
					)}

					{/* the report itself, framed as an attachment */}
					<section className="border-border bg-card overflow-hidden rounded-2xl border">
						<div className="border-border bg-muted/30 flex items-center gap-3 border-b px-5 py-3.5">
							<span className="bg-secondary text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
								<FileTextIcon className="size-4" />
							</span>
							<div className="min-w-0 flex-1">
								<div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
									{t("mail.detail.attachedReport")}
								</div>
								<div className="truncate text-sm font-medium tabular-nums">
									{period}
								</div>
							</div>
							<Button
								variant="outline"
								size="sm"
								className="shrink-0"
								aria-label={t("mail.detail.download")}
								title={t("mail.detail.download")}
								onClick={() =>
									downloadMarkdown(
										`${data.reportName} ${period}.md`,
										data.renderedMarkdown,
									)
								}
							>
								<DownloadIcon className="size-4" />
								<span className="hidden sm:inline">
									{t("mail.detail.download")}
								</span>
							</Button>
						</div>
						<div className="px-5 py-5">
							<MarkdownView markdown={data.renderedMarkdown} />
						</div>
					</section>

					{data.reportId && <ReportDiscussion reportId={data.reportId} />}
				</div>
			</div>
		</div>
	);
}
