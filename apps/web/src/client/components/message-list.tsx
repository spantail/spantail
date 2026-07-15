import type { MailFolder } from "@spantail/core";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCheckIcon, InboxIcon } from "lucide-react";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { MessageListItem } from "@/components/message-list-item";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { api } from "@/lib/api";
import { invalidateMail } from "@/lib/query";
import { useMailActions } from "@/lib/use-mail";

const PAGE_SIZE = 50;

/**
 * Whether toggling `flag` moves the selected item out of `folder`, so the
 * keyboard shortcut should advance the selection to the next message. Mirrors
 * `flagPredicate` in packages/db/src/queries/report-deliveries.ts: every folder
 * keys on `trashed`, only `starred` keys on `starred`, and archive membership
 * (present or absent) is what `inbox`/`sent`/`archive` key on.
 */
function leavesFolder(
	folder: MailFolder,
	flag: "star" | "archive" | "trash",
): boolean {
	if (flag === "trash") return true;
	if (flag === "star") return folder === "starred";
	return folder === "inbox" || folder === "sent" || folder === "archive";
}

export function MessageList({
	folder,
	selectedId,
}: {
	folder: MailFolder;
	selectedId?: string;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const actions = useMailActions();
	// Paginated folder listing. Keyed apart from the toolbar's full-folder query
	// (["mail", folder]) so the infinite-data cache shape doesn't collide.
	const query = useInfiniteQuery({
		queryKey: ["mail", folder, "list"],
		queryFn: ({ pageParam }) =>
			api.listInbox(folder, { limit: PAGE_SIZE, offset: pageParam }),
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
	});
	// Flatten once per fetched page set, with an id→index map so keyboard nav's
	// per-keystroke active-index lookup stays O(1) even on large folders.
	const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
	const indexById = useMemo(
		() => new Map(items.map((item, i) => [item.id, i])),
		[items],
	);
	// s/e/d act on the *open* message, which the toolbar's prev/next can move
	// beyond the loaded pages (it navigates the full, unpaginated folder query).
	// Resolve and advance the shortcuts against that same complete list — shared
	// query key, so one fetch with the toolbar — only while a message is open, so
	// the keys never silently drop on a message below the infinite list's fold.
	const fullList = useQuery({
		queryKey: ["mail", folder],
		queryFn: () => api.listInbox(folder),
		enabled: Boolean(selectedId),
	});
	const fullItems = fullList.data ?? [];

	// j/k move the selection straight to the message's route, so the reading pane
	// updates as you go. Selection is derived from the URL (selectedId).
	const containerRef = useRef<HTMLDivElement>(null);
	const activeIndex = selectedId ? (indexById.get(selectedId) ?? -1) : -1;
	const openMessage = (messageId: string) =>
		navigate({
			to: "/messages/$folder/$messageId",
			params: { folder, messageId },
			replace: true,
		});
	const closeToList = () =>
		navigate({ to: "/messages/$folder", params: { folder }, replace: true });

	// s/e/d toggle a flag on the open message. When the toggle removes it from the
	// current folder the selection advances to the next message (opening it), so a
	// run of e/e/e triages without the mouse; at the end of the folder the reading
	// pane closes to the list. Both the item and the next are read from the full
	// folder list, so the shortcuts work on a message past the loaded pages.
	const applyFlag = (flag: "star" | "archive" | "trash") => {
		if (actions.pending || !selectedId) return;
		const item = fullItems.find((i) => i.id === selectedId);
		if (!item) return;
		if (flag === "star") actions.setStar(item, !item.starred);
		else if (flag === "archive") actions.setArchive(item, !item.archived);
		else actions.setTrash(item, !item.trashed);
		if (!leavesFolder(folder, flag)) return;
		const next = fullItems[fullItems.indexOf(item) + 1];
		if (next) openMessage(next.id);
		else closeToList();
	};
	useListKeyboardNav({
		length: items.length,
		index: activeIndex,
		onMove: (next) => {
			const target = items[next];
			if (target)
				// replace: selection-only moves shouldn't stack history entries
				// (holding j/k would otherwise flood Back/Forward).
				navigate({
					to: "/messages/$folder/$messageId",
					params: { folder, messageId: target.id },
					replace: true,
				});
		},
		actionKeys: {
			s: () => applyFlag("star"),
			e: () => applyFlag("archive"),
			d: () => applyFlag("trash"),
		},
		onReachEnd: () => {
			if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
		},
		containerRef,
	});

	// The Inbox "mark all read" affordance reads the authoritative unread count
	// (paginated pages would miss unread items below the fold).
	const unread = useQuery({
		queryKey: ["inbox-unread"],
		queryFn: () => api.getInboxUnreadCount(),
		enabled: folder === "inbox",
	});
	const hasUnread = folder === "inbox" && (unread.data?.count ?? 0) > 0;

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
			<div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
				{query.isPending ? (
					<div className="flex flex-col">
						{[0, 1, 2, 3].map((i) => (
							<div
								key={i}
								className="border-border/60 flex items-start gap-3 border-b px-4 py-3"
							>
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
					<div className="flex flex-col">
						{items.map((item, index) => (
							<MessageListItem
								key={item.id}
								item={item}
								folder={folder}
								selected={item.id === selectedId}
								index={index}
							/>
						))}
						<InfiniteSentinel
							hasNextPage={Boolean(query.hasNextPage)}
							isFetchingNextPage={query.isFetchingNextPage}
							fetchNextPage={() => query.fetchNextPage()}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
