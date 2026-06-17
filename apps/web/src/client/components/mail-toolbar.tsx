import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { MailFolder, MailItem, MailItemDetail } from "@toxil/core";
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

	const close = () => navigate({ to: "/mail/$folder", params: { folder } });
	const open = (messageId: string) =>
		navigate({ to: "/mail/$folder/$messageId", params: { folder, messageId } });
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
				aria-label={t("mail.toolbar.close")}
				title={t("mail.toolbar.close")}
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
					item.starred ? t("mail.toolbar.unstar") : t("mail.toolbar.star")
				}
				title={item.starred ? t("mail.toolbar.unstar") : t("mail.toolbar.star")}
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
					aria-label={t("mail.toolbar.unarchive")}
					title={t("mail.toolbar.unarchive")}
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
					aria-label={t("mail.toolbar.archive")}
					title={t("mail.toolbar.archive")}
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
					aria-label={t("mail.toolbar.restore")}
					title={t("mail.toolbar.restore")}
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
					aria-label={t("mail.toolbar.trash")}
					title={t("mail.toolbar.trash")}
					disabled={actions.pending}
					onClick={trashAndClose}
				>
					<Trash2Icon />
				</Button>
			)}
			<div className="ml-auto flex items-center gap-1">
				{index >= 0 && items.length > 0 && (
					<span className="text-muted-foreground mr-1 text-xs tabular-nums">
						{t("mail.toolbar.position", {
							index: index + 1,
							total: items.length,
						})}
					</span>
				)}
				<Button
					variant="ghost"
					size="icon"
					className="size-9"
					aria-label={t("mail.toolbar.prev")}
					title={t("mail.toolbar.prev")}
					disabled={!prev}
					onClick={() => prev && open(prev.id)}
				>
					<ChevronLeftIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-9"
					aria-label={t("mail.toolbar.next")}
					title={t("mail.toolbar.next")}
					disabled={!next}
					onClick={() => next && open(next.id)}
				>
					<ChevronRightIcon />
				</Button>
			</div>
		</div>
	);
}
