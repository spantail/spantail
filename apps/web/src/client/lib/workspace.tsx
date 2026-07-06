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
	// Archived workspaces stay reachable by URL (they are still readable) but
	// lose to any active workspace when picking a default — the switcher hides
	// them, so defaulting into one would strand the user in a workspace they
	// cannot switch back to. When *every* membership is archived there is no
	// active workspace to prefer, so fall back to an archived one anyway: it is
	// still readable, and `null` would strand the user on the home hub instead
	// (for admins, in a `/` ↔ `/setup` redirect loop).
	const current =
		(urlSlug ? workspaces.find((w) => w.slug === urlSlug) : undefined) ??
		workspaces.find((w) => w.id === selectedId && !w.archivedAt) ??
		workspaces.find((w) => !w.archivedAt) ??
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

	// Apply an accent color theme to the document only on workspace-scoped routes
	// (`/w/{slug}`). The [data-accent] attribute drives the OKLCH theme tokens in
	// index.css, so the whole app recolors to match the workspace being viewed.
	// The cross-workspace surfaces (home hub, settings, reports, messages) carry
	// no workspace, so they stay neutral instead of inheriting whichever workspace
	// was last viewed — the accent is derived from the URL slug directly, not from
	// `current` (which falls back to the last-visited workspace off-route). On
	// unmount (e.g. sign-out drops back to the login screen, which renders outside
	// this provider) clear it so the default neutral theme applies.
	const scopedAccent =
		(urlSlug
			? workspaces.find((w) => w.slug === urlSlug)?.accentColor
			: undefined) ?? "neutral";
	useEffect(() => {
		const el = document.documentElement;
		el.setAttribute("data-accent", scopedAccent);
		return () => el.removeAttribute("data-accent");
	}, [scopedAccent]);

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
