import type { WorkspaceWithRole } from "@toxil/core";
import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "toxil.ws";

interface WorkspaceContextValue {
	workspaces: WorkspaceWithRole[];
	current: WorkspaceWithRole | null;
	setCurrentId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
	workspaces,
	children,
}: {
	workspaces: WorkspaceWithRole[];
	children: React.ReactNode;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(() =>
		localStorage.getItem(STORAGE_KEY),
	);
	const current =
		workspaces.find((w) => w.id === selectedId) ?? workspaces[0] ?? null;

	useEffect(() => {
		if (current) localStorage.setItem(STORAGE_KEY, current.id);
	}, [current]);

	return (
		<WorkspaceContext.Provider
			value={{ workspaces, current, setCurrentId: setSelectedId }}
		>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace(): WorkspaceContextValue {
	const value = useContext(WorkspaceContext);
	if (!value)
		throw new Error("useWorkspace must be used inside WorkspaceProvider");
	return value;
}
