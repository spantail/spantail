import { Link } from "@tanstack/react-router";
import { formatPeriodLabel, type MailFolder, type MailItem } from "@toxil/core";
import { StarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PersonAvatar } from "@/components/person-avatar";
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
		<Link
			to="/mail/$folder/$messageId"
			params={{ folder, messageId: item.id }}
			className={cn(
				"group flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors",
				selected ? "bg-card ring-border shadow-sm ring-1" : "hover:bg-card/60",
			)}
		>
			<PersonAvatar
				name={isSent ? (item.recipientNames[0] ?? "?") : item.senderName}
				size={36}
			/>
			<span className="min-w-0 flex-1">
				{/* line 1 — sender · time · star */}
				<span className="flex items-center gap-2">
					{unread && (
						<span
							className="bg-primary size-2 shrink-0 rounded-full"
							aria-hidden
						/>
					)}
					<span
						className={cn(
							"min-w-0 truncate text-sm",
							unread ? "font-semibold" : "text-foreground/90 font-medium",
						)}
					>
						{isSent
							? t("mail.list.to", { names: item.recipientNames.join(", ") })
							: item.senderName}
					</span>
					<span className="text-muted-foreground ml-auto shrink-0 text-xs whitespace-nowrap tabular-nums">
						{formatRelativeTime(item.createdAt, i18n.language)}
					</span>
					{/* A span, not a button: the row itself is an <a>, and a nested
					    <button> would close the anchor early in the HTML parser. */}
					<span
						role="button"
						tabIndex={0}
						aria-pressed={item.starred}
						aria-disabled={actions.pending}
						aria-label={
							item.starred ? t("mail.toolbar.unstar") : t("mail.toolbar.star")
						}
						title={
							item.starred ? t("mail.toolbar.unstar") : t("mail.toolbar.star")
						}
						className={cn(
							"flex size-5 shrink-0 items-center justify-center rounded transition-colors",
							item.starred
								? "text-amber-400"
								: "text-transparent group-hover:text-muted-foreground/50 hover:text-muted-foreground",
						)}
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							if (!actions.pending) actions.setStar(item, !item.starred);
						}}
						onKeyDown={(e) => {
							if (e.key !== "Enter" && e.key !== " ") return;
							e.preventDefault();
							e.stopPropagation();
							if (!actions.pending) actions.setStar(item, !item.starred);
						}}
					>
						<StarIcon
							className="size-3.5"
							fill={item.starred ? "currentColor" : "none"}
						/>
					</span>
				</span>
				{/* line 2 — report name · period */}
				<span className="mt-0.5 flex items-baseline gap-2">
					<span
						className={cn(
							"min-w-0 truncate text-sm",
							unread ? "text-foreground" : "text-muted-foreground",
						)}
					>
						{item.reportName}
					</span>
					<span className="text-muted-foreground ml-auto shrink-0 text-xs whitespace-nowrap tabular-nums">
						{formatPeriodLabel({ from: item.dateFrom, to: item.dateTo })}
					</span>
				</span>
				{/* line 3 — message preview */}
				{item.message ? (
					<span className="text-muted-foreground mt-1 line-clamp-2 block text-xs leading-relaxed">
						{item.message}
					</span>
				) : (
					<span className="text-muted-foreground/60 mt-1 block text-xs italic">
						{t("mail.list.noMessage")}
					</span>
				)}
			</span>
		</Link>
	);
}
