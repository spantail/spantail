import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { WorkspaceForm } from "@/components/workspace-form";
import { useWorkspace } from "@/lib/workspace";

export function CreateWorkspaceDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { setCurrentId } = useWorkspace();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>{t("settings.createWorkspace.title")}</DialogTitle>
					<DialogDescription>
						{t("settings.createWorkspace.description")}
					</DialogDescription>
				</DialogHeader>
				<WorkspaceForm
					idPrefix="create-ws"
					onCreated={async (workspace) => {
						await queryClient.invalidateQueries({ queryKey: ["me"] });
						setCurrentId(workspace.id);
						onOpenChange(false);
						// Land on the new workspace. On a `/w/...` route the URL is the
						// source of truth, so navigating is what actually selects it (a bare
						// setCurrentId would be overridden by the current slug).
						navigate({ to: "/w/$wsSlug", params: { wsSlug: workspace.slug } });
					}}
					renderFooter={({ pending }) => (
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
							>
								{t("settings.cancelAction")}
							</Button>
							<Button type="submit" disabled={pending}>
								{t("settings.createAction")}
							</Button>
						</DialogFooter>
					)}
				/>
			</DialogContent>
		</Dialog>
	);
}
