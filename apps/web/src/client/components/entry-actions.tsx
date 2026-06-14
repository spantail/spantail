import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { WorkEntry } from "@toxil/core";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useEntryDialog } from "@/components/entry-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { invalidateWorkEntryData } from "@/lib/query";

/** Kebab edit/delete menu for the viewer's own entries; null for others'. */
export function EntryActions({ entry }: { entry: WorkEntry }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { openEdit } = useEntryDialog();
	const { session } = useRouteContext({ from: "/_authed" });

	const deleteMutation = useMutation({
		mutationFn: () => api.deleteWorkEntry(entry.id),
		onSuccess: () => {
			invalidateWorkEntryData(queryClient, entry.workspaceId);
			toast.success(t("entries.toast.deleted"));
		},
	});

	if (entry.userId !== session.user.id) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="text-muted-foreground size-7"
					aria-label={t("entries.actionsMenu")}
				>
					<MoreHorizontalIcon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => openEdit(entry)}>
					<PencilIcon />
					{t("entries.editAction")}
				</DropdownMenuItem>
				<DropdownMenuItem
					variant="destructive"
					onClick={() => deleteMutation.mutate()}
				>
					<Trash2Icon />
					{t("entries.deleteAction")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
