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
	const starLabel = item.starred
		? t("mail.toolbar.unstar")
		: t("mail.toolbar.star");

	return (
		<div
			className={cn(
				"group relative rounded-xl transition-colors",
				selected ? "bg-card ring-border shadow-sm ring-1" : "hover:bg-card/60",
			)}
		>
			<Link
				to="/mail/$folder/$messageId"
				params={{ folder, messageId: item.id }}
				className="flex w-full gap-3 rounded-xl px-3 py-3 text-left"
			>
				<PersonAvatar
					name={isSent ? (item.recipientNames[0] ?? "?") : item.senderName}
					size={36}
				/>
				<span className="min-w-0 flex-1">
					{/* line 1 — sender · time (the star overlays the right edge) */}
					<span className="flex items-center gap-2 pr-6">
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
			{/* Sibling of the link, not nested: a <button> inside the row's <a>
			    would close the anchor early in the HTML parser. */}
			<button
				type="button"
				disabled={actions.pending}
				aria-label={starLabel}
				aria-pressed={item.starred}
				title={starLabel}
				className={cn(
					"absolute top-3 right-3 z-10 flex size-5 items-center justify-center rounded transition-colors",
					item.starred
						? "text-amber-400"
						: "text-transparent group-hover:text-muted-foreground/50 hover:text-muted-foreground",
				)}
				onClick={() => actions.setStar(item, !item.starred)}
			>
				<StarIcon
					className="size-3.5"
					fill={item.starred ? "currentColor" : "none"}
				/>
			</button>
		</div>
	);
}
