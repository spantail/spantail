import { useTranslation } from "react-i18next";

import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { useSettingsWorkspace } from "@/lib/settings-workspace";
import { cn } from "@/lib/utils";

/**
 * Middle pane of the workspace-scoped settings sections: the workspaces the
 * user can see, with the one the section is editing highlighted. Hidden on
 * mobile, where the section header offers a picker instead.
 */
export function SettingsWorkspacePane() {
	const { t } = useTranslation();
	const { workspaces, selected, selectId } = useSettingsWorkspace();

	return (
		<div className="border-border hidden w-[248px] shrink-0 flex-col border-r md:flex">
			<div className="border-border flex h-14 shrink-0 items-center gap-2 border-b px-4">
				<span className="text-sm font-semibold">
					{t("settings.workspacePane.title")}
				</span>
				<span className="text-muted-foreground text-xs tabular-nums">
					{workspaces.length}
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{workspaces.map((workspace) => {
					const active = workspace.id === selected?.id;
					return (
						<button
							key={workspace.id}
							type="button"
							aria-pressed={active}
							onClick={() => selectId(workspace.id)}
							className={cn(
								"border-border/60 relative flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors",
								active ? "bg-secondary" : "hover:bg-muted/50",
							)}
						>
							{active && (
								<span className="bg-brand absolute inset-y-1 left-0 w-[3px] rounded-r-full" />
							)}
							<WorkspaceAvatar
								name={workspace.name}
								logoUrl={workspace.logoUrl}
								className="size-8 text-[11px]"
							/>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">
									{workspace.name}
								</div>
								<div className="text-muted-foreground truncate text-xs">
									{workspace.slug}
								</div>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
