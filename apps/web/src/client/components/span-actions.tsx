import type { WorkSpan } from "@spantail/core";
import { useRouteContext } from "@tanstack/react-router";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useSpanDialog } from "@/components/span-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteWorkSpan } from "@/hooks/use-delete-span";

/** Kebab edit/delete menu for the viewer's own spans; null for others'. */
export function SpanActions({ span }: { span: WorkSpan }) {
	const { t } = useTranslation();
	const { openEdit } = useSpanDialog();
	const { session } = useRouteContext({ from: "/_authed" });
	const deleteMutation = useDeleteWorkSpan(span);

	if (span.userId !== session.user.id) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="text-muted-foreground size-7"
					aria-label={t("spans.actionsMenu")}
				>
					<MoreHorizontalIcon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => openEdit(span)}>
					<PencilIcon />
					{t("spans.editAction")}
				</DropdownMenuItem>
				<DropdownMenuItem
					variant="destructive"
					onClick={() => deleteMutation.mutate()}
				>
					<Trash2Icon />
					{t("spans.deleteAction")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
