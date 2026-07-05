import {
	formatPeriodLabel,
	type MailFolder,
	renderReportFrontMatterYaml,
} from "@spantail/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	DownloadIcon,
	EyeIcon,
	EyeOffIcon,
	FileTextIcon,
	MoreVerticalIcon,
	PrinterIcon,
	ShareIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { MailToolbar } from "@/components/mail-toolbar";
import { MarkdownView } from "@/components/markdown-view";
import { PersonAvatar } from "@/components/person-avatar";
import { ReportDiscussion } from "@/components/report-discussion";
import { ReportHeaderMeta } from "@/components/report-header-meta";
import { ShareDialog } from "@/components/share-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/document-title";
import { formatRelativeTime } from "@/lib/format";
import { invalidateMail } from "@/lib/query";
import { downloadMarkdown } from "@/lib/report-download";

export const Route = createFileRoute("/messages/$folder/$messageId")({
	component: ReadingPane,
});

function ReadingPane() {
	const { t, i18n } = useTranslation();
	const queryClient = useQueryClient();
	const { folder, messageId } = Route.useParams();
	const folderTyped = folder as MailFolder;
	const [sharing, setSharing] = useState(false);
	// Provenance header hidden by default; the overflow menu toggle reveals the
	// version's own front-matter above the body, mirroring the report view.
	const [showHeader, setShowHeader] = useState(false);

	const detail = useQuery({
		queryKey: ["mail-message", messageId],
		queryFn: () => api.getInboxMessage(messageId),
	});
	const data = detail.data;

	// Fall back to the folder title once the fetch settles without a message, so
	// an inaccessible/deleted message never leaves the prior title in the tab.
	useDocumentTitle(
		data
			? data.scope === "sent"
				? t("messages.documentTitle.sent", {
						report: data.reportName,
						recipient: data.recipientNames.join(", ") || "?",
					})
				: t("messages.documentTitle.received", {
						report: data.reportName,
						sender: data.senderName,
					})
			: detail.isPending
				? undefined
				: t(`messages.folder.${folderTyped}`),
	);

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
				{t("messages.detail.notFound")}
			</div>
		);
	}

	const isSent = data.scope === "sent";
	// Header byline: recipient(s) for a sent batch, the sender for a received copy.
	const personName = isSent ? (data.recipientNames[0] ?? "?") : data.senderName;
	const personLabel = isSent
		? t("messages.list.to", { names: data.recipientNames.join(", ") })
		: data.senderName;
	// Sent: the first recipient's avatar (already resolved on the detail);
	// received: the sender's avatar.
	const personImageUrl = isSent
		? (data.recipients[0]?.imageUrl ?? null)
		: data.senderImageUrl;
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
							<PersonAvatar
								name={personName}
								imageUrl={personImageUrl}
								size={40}
							/>
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
					<section className="flex flex-col">
						<div className="border-border bg-muted/40 -mx-8 flex items-center gap-3 border-y px-8 py-3.5">
							<span className="text-muted-foreground flex size-9 shrink-0 items-center justify-center">
								<FileTextIcon className="size-4" />
							</span>
							<div className="min-w-0 flex-1">
								<div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
									{t("messages.detail.attachedReport")}
								</div>
								<div className="truncate text-sm font-medium tabular-nums">
									{period}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								{/* Re-sharing is a recipient action on the received copy, so
								    it is offered on received messages only. */}
								{data.scope === "received" && (
									<Button
										variant="outline"
										size="sm"
										aria-label={t("messages.detail.share")}
										title={t("messages.detail.share")}
										onClick={() => setSharing(true)}
									>
										<ShareIcon className="size-4" />
									</Button>
								)}
								<Button
									variant="outline"
									size="sm"
									aria-label={t("messages.detail.print")}
									title={t("messages.detail.print")}
									onClick={() => window.print()}
								>
									<PrinterIcon className="size-4" />
								</Button>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											aria-label={t("messages.detail.moreActions")}
											title={t("messages.detail.moreActions")}
										>
											<MoreVerticalIcon className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-48">
										<DropdownMenuItem
											className="gap-2.5 px-2 py-1.5"
											onSelect={() =>
												downloadMarkdown(
													`${data.reportName} ${period}.md`,
													data.renderedMarkdown,
												)
											}
										>
											<DownloadIcon />
											{t("messages.detail.download")}
										</DropdownMenuItem>
										{/* Toggle the version's provenance header above the body.
										    The eye state icon reads as shown / hidden. */}
										<DropdownMenuItem
											className="gap-2.5 px-2 py-1.5"
											onSelect={() => setShowHeader((v) => !v)}
										>
											{showHeader ? <EyeIcon /> : <EyeOffIcon />}
											{showHeader
												? t("messages.detail.hideHeader")
												: t("messages.detail.showHeader")}
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
						{showHeader && (
							<div className="pt-6">
								<ReportHeaderMeta
									frontMatter={renderReportFrontMatterYaml(
										data.renderedMarkdown,
									)}
									onClose={() => setShowHeader(false)}
								/>
							</div>
						)}
						<div className="print-area pt-6">
							{/* A received report: the report variant strips the system
							    front-matter header and gives it the article look. */}
							<MarkdownView markdown={data.renderedMarkdown} variant="report" />
						</div>
					</section>

					<ReportDiscussion reportContentId={data.reportContentId} />
				</div>
			</div>
			{sharing && data.scope === "received" && (
				<ShareDialog
					source={{
						kind: "delivery",
						id: data.id,
						reportName: data.reportName,
						dateFrom: data.dateFrom,
						dateTo: data.dateTo,
					}}
					onClose={() => setSharing(false)}
				/>
			)}
		</div>
	);
}
