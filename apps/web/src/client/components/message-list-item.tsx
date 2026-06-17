import { Link } from "@tanstack/react-router";
import { formatPeriodLabel, type MailFolder, type MailItem } from "@toxil/core";
import { RotateCcwIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { useMailActions } from "@/lib/use-mail";
import { cn } from "@/lib/utils";

export function MessageListItem({
	item,
	folder,
	selected,
}: {
	item: MailItem;
	folder: MailFolder;
	selected: boolean;
}) {
	const { t, i18n } = useTranslation();
	const actions = useMailActions();
	const unread = item.scope === "received" && item.readAt === null;
	const isSent = item.scope === "sent";

	return (
		<div
			className={cn(
				"group relative flex items-start gap-2 px-3 py-3 transition-colors",
				selected ? "bg-accent" : "hover:bg-muted/50",
				unread && !selected && "bg-primary/[0.04]",
			)}
		>
			<Link
				to="/mail/$folder/$messageId"
				params={{ folder, messageId: item.id }}
				className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
			>
				<span className="mt-2 flex w-1.5 shrink-0 justify-center">
					{unread && (
						<span className="bg-primary size-2 rounded-full" aria-hidden />
					)}
				</span>
				<PersonAvatar
					name={isSent ? (item.recipientNames[0] ?? "?") : item.senderName}
					size={36}
				/>
				<span className="min-w-0 flex-1">
					<span className="flex items-baseline justify-between gap-2">
						<span
							className={cn(
								"min-w-0 truncate text-sm",
								unread ? "font-semibold" : "font-medium",
							)}
						>
							{isSent
								? t("mail.list.to", {
										names: item.recipientNames.join(", "),
									})
								: item.senderName}
						</span>
						<span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap tabular-nums">
							{formatRelativeTime(item.createdAt, i18n.language)}
						</span>
					</span>
					<span className="mt-0.5 flex items-baseline gap-2">
						<span
							className={cn(
								"min-w-0 truncate text-sm",
								unread ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{item.reportName}
						</span>
						<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
							{formatPeriodLabel({ from: item.dateFrom, to: item.dateTo })}
						</span>
					</span>
					{item.message && (
						<span className="text-muted-foreground mt-0.5 line-clamp-1 block text-xs">
							{item.message}
						</span>
					)}
				</span>
			</Link>
			<div className="flex shrink-0 flex-col items-center gap-0.5">
				<Button
					variant="ghost"
					size="icon"
					disabled={actions.pending}
					aria-label={
						item.starred ? t("mail.toolbar.unstar") : t("mail.toolbar.star")
					}
					title={
						item.starred ? t("mail.toolbar.unstar") : t("mail.toolbar.star")
					}
					className="size-7"
					onClick={() => actions.setStar(item, !item.starred)}
				>
					<StarIcon
						className={cn(
							"size-4",
							item.starred
								? "fill-amber-400 text-amber-400"
								: "text-muted-foreground",
						)}
					/>
				</Button>
				{item.trashed ? (
					<Button
						variant="ghost"
						size="icon"
						disabled={actions.pending}
						aria-label={t("mail.toolbar.restore")}
						title={t("mail.toolbar.restore")}
						className="text-muted-foreground size-7 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
						onClick={() => actions.setTrash(item, false)}
					>
						<RotateCcwIcon className="size-4" />
					</Button>
				) : (
					<Button
						variant="ghost"
						size="icon"
						disabled={actions.pending}
						aria-label={t("mail.toolbar.trash")}
						title={t("mail.toolbar.trash")}
						className="text-muted-foreground size-7 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
						onClick={() => actions.setTrash(item, true)}
					>
						<Trash2Icon className="size-4" />
					</Button>
				)}
			</div>
		</div>
	);
}
