import {
	createFileRoute,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { SettingsSection } from "@/components/settings-section";
import { settingsSectionLabelKey } from "@/components/settings-sidebar";
import { SettingsWorkspacePane } from "@/components/settings-workspace-pane";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useSettingsWorkspace } from "@/lib/settings-workspace";

export const Route = createFileRoute("/settings/_workspace")({
	component: WorkspaceSectionsLayout,
});

// Layout for the workspace-scoped sections (General, Projects, Members): a
// workspaces pane beside the section content, both editing the workspace
// selected in the settings-local context.
function WorkspaceSectionsLayout() {
	const { t } = useTranslation();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const labelKey = settingsSectionLabelKey(pathname);
	const { workspaces, selected, selectId } = useSettingsWorkspace();

	return (
		<div className="flex h-full min-h-0">
			<SettingsWorkspacePane />
			<SettingsSection
				title={labelKey ? t(labelKey) : ""}
				meta={selected?.name}
				actions={
					// The pane is hidden on mobile; this picker replaces it there.
					workspaces.length > 1 && (
						<div className="md:hidden">
							<Select
								value={selected?.id ?? ""}
								onValueChange={(id) => selectId(id)}
							>
								<SelectTrigger
									size="sm"
									aria-label={t("settings.workspacePane.title")}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{workspaces.map((workspace) => (
										<SelectItem key={workspace.id} value={workspace.id}>
											{workspace.archivedAt
												? t("workspace.archivedOption", {
														name: workspace.name,
													})
												: workspace.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)
				}
			>
				<Outlet />
			</SettingsSection>
		</div>
	);
}
