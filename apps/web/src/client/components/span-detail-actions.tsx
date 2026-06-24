import type { WorkSpan } from "@spantail/core";
import { useRouteContext } from "@tanstack/react-router";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { useDeleteWorkSpan } from "@/hooks/use-delete-span";

/**
 * Detail-dialog footer: Delete/Edit for the viewer's own span, a plain Close
 * for spans owned by someone else.
 */
export function SpanDetailActions({
	span,
	onEdit,
	onClose,
}: {
	span: WorkSpan;
	onEdit: () => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const { session } = useRouteContext({ from: "/_authed" });
	const deleteMutation = useDeleteWorkSpan(span, onClose);

	if (span.userId !== session.user.id) {
		return (
			<DialogFooter>
				<Button variant="outline" onClick={onClose}>
					{t("spans.closeAction")}
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
				{t("spans.deleteAction")}
			</Button>
			<Button onClick={onEdit}>
				<PencilIcon />
				{t("spans.editAction")}
			</Button>
		</DialogFooter>
	);
}
