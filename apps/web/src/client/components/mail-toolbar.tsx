import type { MailFolder, MailItem, MailItemDetail } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	ArchiveIcon,
	ArchiveRestoreIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	RotateCcwIcon,
	StarIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useMailActions } from "@/lib/use-mail";
import { cn } from "@/lib/utils";

export function MailToolbar({
	item,
	folder,
}: {
	item: MailItemDetail;
	folder: MailFolder;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const actions = useMailActions();
	const list = useQuery({
		queryKey: ["mail", folder],
		queryFn: () => api.listInbox(folder),
	});
	const items: MailItem[] = list.data ?? [];
	const index = items.findIndex((m) => m.id === item.id);
	const prev = index > 0 ? items[index - 1] : undefined;
	const next =
		index >= 0 && index < items.length - 1 ? items[index + 1] : undefined;

	const close = () => navigate({ to: "/messages/$folder", params: { folder } });
	const open = (messageId: string) =>
		navigate({
			to: "/messages/$folder/$messageId",
			params: { folder, messageId },
		});
	// Archiving or trashing removes the item from the current folder, so step back
	// to the list afterwards.
	const archiveAndClose = () => {
		actions.setArchive(item, true);
		close();
	};
	const trashAndClose = () => {
		actions.setTrash(item, true);
		close();
	};

	return (
		<div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
			<Button
				variant="ghost"
				size="icon"
				className="size-9"
				aria-label={t("messages.toolbar.close")}
				title={t("messages.toolbar.close")}
				onClick={close}
			>
				<XIcon />
			</Button>
			<div className="bg-border mx-1 h-5 w-px" aria-hidden />
			<Button
				variant="ghost"
				size="icon"
				className="size-9"
				aria-label={
					item.starred
						? t("messages.toolbar.unstar")
						: t("messages.toolbar.star")
				}
				title={`${
					item.starred
						? t("messages.toolbar.unstar")
						: t("messages.toolbar.star")
				} (s)`}
				disabled={actions.pending}
				onClick={() => actions.setStar(item, !item.starred)}
			>
				<StarIcon
					className={cn(item.starred && "fill-amber-400 text-amber-400")}
				/>
			</Button>
			{item.archived ? (
				<Button
					variant="ghost"
					size="icon"
					className="size-9"
					aria-label={t("messages.toolbar.unarchive")}
					title={`${t("messages.toolbar.unarchive")} (e)`}
					disabled={actions.pending}
					onClick={() => actions.setArchive(item, false)}
				>
					<ArchiveRestoreIcon />
				</Button>
			) : (
				<Button
					variant="ghost"
					size="icon"
					className="size-9"
					aria-label={t("messages.toolbar.archive")}
					title={`${t("messages.toolbar.archive")} (e)`}
					disabled={actions.pending}
					onClick={archiveAndClose}
				>
					<ArchiveIcon />
				</Button>
			)}
			{item.trashed ? (
				<Button
					variant="ghost"
					size="icon"
					className="size-9"
					aria-label={t("messages.toolbar.restore")}
					title={`${t("messages.toolbar.restore")} (d)`}
					disabled={actions.pending}
					onClick={() => actions.setTrash(item, false)}
				>
					<RotateCcwIcon />
				</Button>
			) : (
				<Button
					variant="ghost"
					size="icon"
					className="size-9"
					aria-label={t("messages.toolbar.trash")}
					title={`${t("messages.toolbar.trash")} (d)`}
					disabled={actions.pending}
					onClick={trashAndClose}
				>
					<Trash2Icon />
				</Button>
			)}
			<div className="ml-auto flex items-center gap-1">
				{index >= 0 && items.length > 0 && (
					<span className="text-muted-foreground mr-1 text-xs tabular-nums">
						{t("messages.toolbar.position", {
							index: index + 1,
							total: items.length,
						})}
					</span>
				)}
				<Button
					variant="ghost"
					size="icon"
					className="size-9"
					aria-label={t("messages.toolbar.prev")}
					title={t("messages.toolbar.prev")}
					disabled={!prev}
					onClick={() => prev && open(prev.id)}
				>
					<ChevronLeftIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-9"
					aria-label={t("messages.toolbar.next")}
					title={t("messages.toolbar.next")}
					disabled={!next}
					onClick={() => next && open(next.id)}
				>
					<ChevronRightIcon />
				</Button>
			</div>
		</div>
	);
}
