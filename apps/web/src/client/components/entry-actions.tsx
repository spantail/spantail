import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { WorkEntry } from "@toxil/core";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useEntryDialog } from "@/components/entry-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { invalidateWorkEntryData } from "@/lib/query";

/** Edit/delete buttons for the viewer's own entries; null for others'. */
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
		<div className="flex justify-end gap-1">
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("entries.editAction")}
				onClick={() => openEdit(entry)}
			>
				<PencilIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("entries.deleteAction")}
				onClick={() => deleteMutation.mutate()}
			>
				<Trash2Icon />
			</Button>
		</div>
	);
}
