import { useRouteContext } from "@tanstack/react-router";
import type { WorkEntry } from "@toxil/core";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { useDeleteWorkEntry } from "@/hooks/use-delete-work-entry";

/** Edit/delete footer for the detail dialog; null for entries the viewer can't manage. */
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

	if (entry.userId !== session.user.id) return null;

	return (
		<DialogFooter className="sm:justify-between">
			<Button
				variant="destructive"
				disabled={deleteMutation.isPending}
				onClick={() => deleteMutation.mutate()}
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
