import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MailFolder } from "@toxil/core";
import { CheckCheckIcon, InboxIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MessageListItem } from "@/components/message-list-item";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { invalidateMail } from "@/lib/query";

export function MessageList({
	folder,
	selectedId,
}: {
	folder: MailFolder;
	selectedId?: string;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: ["mail", folder],
		queryFn: () => api.listInbox(folder),
	});
	const items = query.data ?? [];
	const hasUnread = items.some(
		(m) => m.scope === "received" && m.readAt === null,
	);

	const markAll = useMutation({
		mutationFn: () => api.markAllInboxRead(),
		onSettled: () => invalidateMail(queryClient),
	});

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
				<h2 className="font-heading text-base font-semibold tracking-tight">
					{t(`messages.folder.${folder}`)}
				</h2>
				{folder === "inbox" && (
					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground h-7 text-xs"
						disabled={!hasUnread || markAll.isPending}
						onClick={() => markAll.mutate()}
					>
						<CheckCheckIcon className="size-3.5" />
						{t("notifications.markAllRead")}
					</Button>
				)}
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				{query.isPending ? (
					<div className="flex flex-col gap-1">
						{[0, 1, 2, 3].map((i) => (
							<div key={i} className="flex items-start gap-3 px-3 py-3">
								<Skeleton className="size-9 shrink-0 rounded-full" />
								<div className="flex-1 space-y-2 py-0.5">
									<Skeleton className="h-3 w-2/3" />
									<Skeleton className="h-3 w-1/2" />
								</div>
							</div>
						))}
					</div>
				) : items.length === 0 ? (
					<div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
						<div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
							<InboxIcon className="size-5" />
						</div>
						<p className="text-muted-foreground text-sm">
							{t(`messages.empty.${folder}`)}
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-1">
						{items.map((item) => (
							<MessageListItem
								key={item.id}
								item={item}
								folder={folder}
								selected={item.id === selectedId}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
