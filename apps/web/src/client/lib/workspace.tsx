import type { WorkspaceWithRole } from "@spantail/core";
import { useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "spantail.ws";

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
	// On workspace-scoped routes (`/w/{slug}/...`) the URL is the source of
	// truth; elsewhere (settings, reports, messages) the persisted last-visited
	// workspace is. The selector returns the slug segment only, so this provider
	// re-renders just when the active workspace changes, not on every navigation.
	const urlSlug = useRouterState({
		select: (s) => s.location.pathname.match(/^\/w\/([^/]+)/)?.[1] ?? null,
	});
	const current =
		(urlSlug ? workspaces.find((w) => w.slug === urlSlug) : undefined) ??
		workspaces.find((w) => w.id === selectedId) ??
		workspaces[0] ??
		null;

	// Fold the resolved workspace back into state so a URL-driven selection
	// survives leaving the scoped route: without this, navigating from `/w/acme`
	// to a top-level surface (settings, reports, home) would drop `urlSlug` and
	// fall back to a stale `selectedId`. Re-setting the same id is a no-op, so
	// this does not loop.
	useEffect(() => {
		if (!current) return;
		setSelectedId(current.id);
		localStorage.setItem(STORAGE_KEY, current.id);
	}, [current]);

	// Apply the active workspace's accent color theme to the document. The
	// [data-accent] attribute drives the OKLCH theme tokens in index.css, so the
	// whole app recolors when the workspace (or its setting) changes. On unmount
	// (e.g. sign-out drops back to the login screen, which renders outside this
	// provider) clear it so the default neutral theme applies.
	useEffect(() => {
		const el = document.documentElement;
		el.setAttribute("data-accent", current?.accentColor ?? "neutral");
		return () => el.removeAttribute("data-accent");
	}, [current?.accentColor]);

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
