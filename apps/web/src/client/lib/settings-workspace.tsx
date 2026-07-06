import type { WorkspaceWithRole } from "@spantail/core";
import { createContext, useContext, useState } from "react";

import { useWorkspace } from "@/lib/workspace";

interface SettingsWorkspaceValue {
	workspaces: WorkspaceWithRole[];
	selected: WorkspaceWithRole | null;
	selectId: (id: string) => void;
	/** Whether the signed-in user can manage the selected workspace. */
	canManage: boolean;
}

const SettingsWorkspaceContext = createContext<SettingsWorkspaceValue | null>(
	null,
);

/**
 * Which workspace the workspace-scoped settings sections (General, Projects,
 * Members) operate on. The selection is settings-local: it defaults to the
 * app-wide active workspace and survives switching between sections, but it
 * never changes the active workspace itself. Instance admins see every
 * workspace on the instance (with `role: null`), so they can administer
 * workspaces they are not a member of.
 */
export function SettingsWorkspaceProvider({
	isAdmin,
	children,
}: {
	isAdmin: boolean;
	children: React.ReactNode;
}) {
	const { workspaces, current } = useWorkspace();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected =
		workspaces.find((w) => w.id === selectedId) ??
		current ??
		workspaces[0] ??
		null;
	const canManage =
		selected != null &&
		(isAdmin || selected.role === "owner" || selected.role === "admin");

	return (
		<SettingsWorkspaceContext.Provider
			value={{ workspaces, selected, selectId: setSelectedId, canManage }}
		>
			{children}
		</SettingsWorkspaceContext.Provider>
	);
}

export function useSettingsWorkspace(): SettingsWorkspaceValue {
	const value = useContext(SettingsWorkspaceContext);
	if (!value)
		throw new Error(
			"useSettingsWorkspace must be used inside SettingsWorkspaceProvider",
		);
	return value;
}
