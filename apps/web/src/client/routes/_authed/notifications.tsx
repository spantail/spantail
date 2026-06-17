import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	formatPeriodLabel,
	type InboxMessage,
	type InboxMessageDetail,
} from "@toxil/core";
import { CheckCheckIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { invalidateInbox } from "@/lib/query";

export const Route = createFileRoute("/_authed/notifications")({
	component: NotificationsPage,
});

type TabId = "all" | "unread";

function NotificationsPage() {
	const { t, i18n } = useTranslation();
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<TabId>("all");
	const [viewing, setViewing] = useState<InboxMessageDetail | null>(null);
	const [error, setError] = useState<string | null>(null);

	const inbox = useQuery({
		queryKey: ["inbox"],
		queryFn: () => api.listInbox(),
	});
	const rows = inbox.data ?? [];
	const unreadCount = rows.filter((m) => m.readAt === null).length;

	// Opening a message fetches its frozen body and marks it read.
	const openMutation = useMutation({
		mutationFn: (message: InboxMessage) => api.getInboxMessage(message.id),
		onSuccess: async (detail, message) => {
			setViewing(detail);
			setError(null);
			if (message.readAt === null) {
				await api.markInboxRead(message.id);
				invalidateInbox(queryClient);
			}
		},
		onError: (err: Error) => setError(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteInboxMessage(id),
		onSuccess: (_data, id) => {
			invalidateInbox(queryClient);
			setViewing((current) => (current?.id === id ? null : current));
		},
		onError: (err: Error) => setError(err.message),
	});

	const markAllMutation = useMutation({
		mutationFn: () => api.markAllInboxRead(),
		onSuccess: () => invalidateInbox(queryClient),
		onError: (err: Error) => setError(err.message),
	});

	const visible =
		tab === "unread" ? rows.filter((m) => m.readAt === null) : rows;

	const tabs: { id: TabId; label: string }[] = [
		{ id: "all", label: t("notifications.tab.all") },
		{ id: "unread", label: t("notifications.tab.unread") },
	];

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-heading text-xl font-semibold tracking-tight">
						{t("notifications.title")}
					</h1>
					<p className="text-muted-foreground mt-0.5 text-sm">
						{t("notifications.description")}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={unreadCount === 0 || markAllMutation.isPending}
					onClick={() => markAllMutation.mutate()}
				>
					<CheckCheckIcon />
					{t("notifications.markAllRead")}
				</Button>
			</div>

			<div className="flex items-center gap-1 border-b">
				{tabs.map((tabItem) => {
					const selected = tab === tabItem.id;
					return (
						<button
							key={tabItem.id}
							type="button"
							onClick={() => setTab(tabItem.id)}
							className={`relative px-3 pt-1 pb-2.5 text-sm transition-colors ${
								selected
									? "text-foreground font-medium"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{tabItem.label}
							{tabItem.id === "unread" && unreadCount > 0 && (
								<span className="bg-muted text-muted-foreground ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums">
									{unreadCount}
								</span>
							)}
							{selected && (
								<span className="bg-foreground absolute inset-x-2 bottom-0 h-0.5 rounded-full" />
							)}
						</button>
					);
				})}
			</div>

			{error && <p className="text-destructive text-sm">{error}</p>}

			{visible.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					{tab === "unread"
						? t("notifications.emptyUnread")
						: t("notifications.empty")}
				</p>
			) : (
				<div className="divide-y overflow-hidden rounded-xl border">
					{visible.map((message) => {
						const unread = message.readAt === null;
						return (
							<div
								key={message.id}
								className="group hover:bg-muted/40 flex items-center transition-colors"
							>
								<button
									type="button"
									disabled={openMutation.isPending}
									onClick={() => openMutation.mutate(message)}
									className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pr-2 pl-4 text-left"
								>
									<span
										className={`size-2 shrink-0 rounded-full ${
											unread ? "bg-primary" : "bg-transparent"
										}`}
										aria-hidden
									/>
									<span className="min-w-0 flex-1">
										<span className="flex items-baseline gap-2">
											<span
												className={`min-w-0 truncate text-sm ${
													unread ? "font-semibold" : "font-medium"
												}`}
											>
												{message.reportName}
											</span>
											<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
												{formatPeriodLabel({
													from: message.dateFrom,
													to: message.dateTo,
												})}
											</span>
										</span>
										<span className="text-muted-foreground mt-0.5 block truncate text-xs">
											{t("notifications.from", { name: message.senderName })}
											{message.message ? ` · ${message.message}` : ""}
										</span>
									</span>
									<span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:block">
										{new Date(message.createdAt).toLocaleDateString(
											i18n.language,
											{ month: "short", day: "numeric" },
										)}
									</span>
								</button>
								<Button
									variant="ghost"
									size="icon"
									aria-label={t("notifications.deleteAction")}
									className="text-muted-foreground mr-2 ml-1 size-8 shrink-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
									onClick={() => deleteMutation.mutate(message.id)}
								>
									<Trash2Icon />
								</Button>
							</div>
						);
					})}
				</div>
			)}

			{viewing && (
				<Dialog open onOpenChange={(open) => !open && setViewing(null)}>
					<DialogContent size="3xl">
						<DialogHeader>
							<DialogTitle className="pr-10">
								{viewing.reportName}{" "}
								{formatPeriodLabel({
									from: viewing.dateFrom,
									to: viewing.dateTo,
								})}
							</DialogTitle>
							<DialogDescription>
								{t("notifications.from", { name: viewing.senderName })}
							</DialogDescription>
						</DialogHeader>
						{viewing.message && (
							<p className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
								{viewing.message}
							</p>
						)}
						<MarkdownView markdown={viewing.renderedMarkdown} />
						<DialogFooter>
							<DialogClose asChild>
								<Button>{t("notifications.closeAction")}</Button>
							</DialogClose>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
