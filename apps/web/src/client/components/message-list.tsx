import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MailFolder } from "@toxil/core";
import { CheckCheckIcon, InboxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { MessageListItem } from "@/components/message-list-item";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { invalidateMail } from "@/lib/query";

const PAGE_SIZE = 50;

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

	// Infinite scroll: render a growing window of the folder, extended by the
	// sentinel. Reset to the first page when the folder changes.
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [prevFolder, setPrevFolder] = useState(folder);
	if (folder !== prevFolder) {
		setPrevFolder(folder);
		setVisibleCount(PAGE_SIZE);
	}
	// Keep a deep-linked selection within the window so it stays highlighted.
	const selectedIndex = selectedId
		? items.findIndex((m) => m.id === selectedId)
		: -1;
	useEffect(() => {
		if (selectedIndex >= 0)
			setVisibleCount((count) =>
				Math.max(count, Math.ceil((selectedIndex + 1) / PAGE_SIZE) * PAGE_SIZE),
			);
	}, [selectedIndex]);
	const visible = items.slice(0, visibleCount);

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
						{visible.map((item) => (
							<MessageListItem
								key={item.id}
								item={item}
								folder={folder}
								selected={item.id === selectedId}
							/>
						))}
						<InfiniteSentinel
							hasNextPage={visibleCount < items.length}
							isFetchingNextPage={false}
							fetchNextPage={() =>
								setVisibleCount((count) => count + PAGE_SIZE)
							}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
