import { useRouteContext } from "@tanstack/react-router";
import type { WorkEntry } from "@toxil/core";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { useDeleteWorkEntry } from "@/hooks/use-delete-work-entry";

/**
 * Detail-dialog footer: Delete/Edit for the viewer's own entry, a plain Close
 * for entries owned by someone else.
 */
export function EntryDetailActions({
	entry,
	onEdit,
	onClose,
}: {
	entry: WorkEntry;
	onEdit: () => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const { session } = useRouteContext({ from: "/_authed" });
	const deleteMutation = useDeleteWorkEntry(entry, onClose);

	if (entry.userId !== session.user.id) {
		return (
			<DialogFooter>
				<Button variant="outline" onClick={onClose}>
					{t("entries.closeAction")}
				</Button>
			</DialogFooter>
		);
	}

	return (
		<DialogFooter className="sm:justify-between">
			<Button
				variant="ghost"
				disabled={deleteMutation.isPending}
				onClick={() => deleteMutation.mutate()}
				className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
			>
				<Trash2Icon />
				{t("entries.deleteAction")}
			</Button>
			<Button onClick={onEdit}>
				<PencilIcon />
				{t("entries.editAction")}
			</Button>
		</DialogFooter>
	);
}
