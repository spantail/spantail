import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { MailItem } from "@toxil/core";
import { InboxIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PersonAvatar } from "@/components/person-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const RECENT_LIMIT = 4;

const isUnread = (item: MailItem) =>
	item.scope === "received" && item.readAt === null;

/**
 * Compact inbox widget for the home dashboard — the most recent reports
 * teammates sent for review, with a jump into the full inbox. Period-agnostic:
 * the dashboard period selector does not affect it. The card stretches to its
 * row sibling's height (the donut) and the list scrolls when it overflows.
 */
export function HomeInbox({ className }: { className?: string }) {
	const { t, i18n } = useTranslation();
	const inbox = useQuery({
		queryKey: ["mail", "inbox", "list", "home"],
		queryFn: () => api.listInbox("inbox", { limit: RECENT_LIMIT }),
	});
	const unread = useQuery({
		queryKey: ["inbox-unread"],
		queryFn: () => api.getInboxUnreadCount(),
		refetchInterval: 60_000,
	});
	const items = inbox.data ?? [];
	const unreadCount = unread.data?.count ?? 0;

	return (
		<Card className={cn("h-full [--card-spacing:--spacing(5)]", className)}>
			<CardHeader className="flex shrink-0 items-center justify-between pb-2">
				<div className="flex items-center gap-2">
					<CardTitle className="text-sm font-semibold">
						{t("messages.folder.inbox")}
					</CardTitle>
					{unreadCount > 0 && (
						<span className="bg-brand-solid text-brand-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
							{unreadCount > 99 ? "99+" : unreadCount}
						</span>
					)}
				</div>
				<Link
					to="/messages"
					className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
				>
					{t("dashboard.viewAll")}
				</Link>
			</CardHeader>
			{/* px-0 so the absolute scroll child owns the horizontal padding; the
			    list lives in an absolutely-positioned scroller so it never drives
			    the card height — the card matches the donut and overflow scrolls. */}
			<CardContent className="relative min-h-0 flex-1 px-0">
				<div className="absolute inset-0 overflow-y-auto px-(--card-spacing)">
					{inbox.isPending ? (
						<div className="flex h-full items-center justify-center">
							<p className="text-muted-foreground text-sm">
								{t("app.loading")}
							</p>
						</div>
					) : items.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
							<div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
								<InboxIcon className="size-[18px]" />
							</div>
							<p className="text-muted-foreground text-sm">
								{t("messages.empty.inbox")}
							</p>
						</div>
					) : (
						<ul className="-mx-2 flex flex-col">
							{items.map((item) => (
								<li key={item.id}>
									<Link
										to="/messages"
										className="hover:bg-muted/50 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors"
									>
										<span className="mt-1.5 flex w-1.5 shrink-0 justify-center">
											{isUnread(item) && (
												<span className="bg-brand size-1.5 rounded-full" />
											)}
										</span>
										<PersonAvatar name={item.senderName} size={32} />
										<div className="min-w-0 flex-1">
											<div className="flex items-baseline gap-2">
												<span
													className={cn(
														"truncate text-sm",
														isUnread(item) ? "font-semibold" : "font-medium",
													)}
												>
													{item.reportName}
												</span>
												<span className="text-muted-foreground ml-auto shrink-0 text-xs whitespace-nowrap">
													{formatRelativeTime(item.createdAt, i18n.language)}
												</span>
											</div>
											<p className="text-muted-foreground mt-0.5 truncate text-xs">
												<span className="text-foreground/80 font-medium">
													{item.senderName}
												</span>
												{item.message ? ` · ${item.message}` : null}
											</p>
										</div>
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
