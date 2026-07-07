import type { WorkEntry } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EntryDetailPanel } from "@/components/entry-detail-panel";
import { type EntryCreatePrefill, EntryForm } from "@/components/entry-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useProjects } from "@/hooks/use-projects";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { api } from "@/lib/api";
import { isTypingTarget } from "@/lib/keyboard";
import { useWorkspace } from "@/lib/workspace";

type EntryDialogState =
	| {
			mode: "create";
			defaultProjectId?: string;
			prefill?: EntryCreatePrefill;
			onCreated?: () => void;
	  }
	| { mode: "edit"; entry: WorkEntry };

/** The selected entry plus the object to fall back to if it leaves the list. */
type PanelSelection = { id: string; entry: WorkEntry };

/**
 * What a page-registered supplier tells the global `c` shortcut to do:
 * open with a prefill, ignore the keypress (e.g. an invalid selection), or
 * null for "no opinion" — a plain create.
 */
export type CreatePrefillResult =
	| { kind: "prefill"; prefill: EntryCreatePrefill; onCreated?: () => void }
	| { kind: "blocked" }
	| null;

interface EntryDialogContextValue {
	openCreate: (
		prefill?: EntryCreatePrefill,
		opts?: { onCreated?: () => void },
	) => void;
	openEdit: (entry: WorkEntry) => void;
	/** Shows `entry` in the docked detail panel (opens it, or swaps its content). */
	openView: (entry: WorkEntry) => void;
	/** Id of the entry the panel is showing, so lists can highlight its row. */
	viewEntryId: string | null;
	/**
	 * The mounted entry list registers its ordered entries here (null on
	 * unmount) so the panel can move through them (prev/next, counter, arrows).
	 */
	registerEntries: (entries: WorkEntry[] | null) => void;
	/**
	 * Registers the supplier the `c` shortcut consults before opening (pass
	 * null to unregister). Pages with a bulk selection use it so the shortcut
	 * prefills exactly like their explicit "log work" button.
	 */
	setCreatePrefillSource: (source: (() => CreatePrefillResult) | null) => void;
}

const EntryDialogContext = createContext<EntryDialogContextValue | null>(null);

export function useEntryDialog(): EntryDialogContextValue {
	const value = useContext(EntryDialogContext);
	if (!value)
		throw new Error("useEntryDialog must be used inside EntryDialogProvider");
	return value;
}

export function EntryDialogProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const timezone = useUserTimezone();
	const projects = useProjects();
	const [state, setState] = useState<EntryDialogState | null>(null);
	// The entry shown in the docked detail panel (view mode), independent of the
	// create/edit dialog above — editing from the panel opens the dialog while
	// the panel stays put.
	const [selection, setSelection] = useState<PanelSelection | null>(null);
	// Ordered entries of the mounted list, kept live so the panel's prev/next
	// and counter track the same (paginated) order the user sees.
	const [navEntries, setNavEntries] = useState<WorkEntry[]>([]);
	// Remount key so the form re-derives its initial state on every open.
	const [instanceId, setInstanceId] = useState(0);
	// An archived workspace is read-only, so creating is blocked here — the one
	// chokepoint both the buttons and the `c` shortcut go through.
	const canCreate = Boolean(current) && !current?.archivedAt;

	// On a project page (`/w/{wsSlug}/projects/{projectSlug}`), creating
	// pre-selects that project (only while it is active — the form's select
	// lists active projects only). The path carries the slug, so resolve it to
	// the project id the form expects.
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const routeProjectSlug = pathname.match(
		/^\/w\/[^/]+\/projects\/([^/]+)/,
	)?.[1];
	const contextProjectId = (projects.data ?? []).find(
		(project) =>
			project.slug === routeProjectSlug && project.status === "active",
	)?.id;
	// The panel is a home/project surface only (like the mockup); on the reports,
	// settings or other takeovers it stays hidden even if a selection lingers.
	const onPanelRoute =
		/^\/w\/[^/]+\/?$/.test(pathname) ||
		/^\/w\/[^/]+\/projects\/[^/]+/.test(pathname);

	const openCreate = useCallback(
		(prefill?: EntryCreatePrefill, opts?: { onCreated?: () => void }) => {
			if (!canCreate) return;
			setInstanceId((id) => id + 1);
			setState({
				mode: "create",
				defaultProjectId: contextProjectId,
				prefill,
				onCreated: opts?.onCreated,
			});
		},
		[canCreate, contextProjectId],
	);
	const openEdit = useCallback((entry: WorkEntry) => {
		setInstanceId((id) => id + 1);
		setState({ mode: "edit", entry });
	}, []);
	const openView = useCallback((entry: WorkEntry) => {
		setSelection({ id: entry.id, entry });
	}, []);
	const registerEntries = useCallback((entries: WorkEntry[] | null) => {
		// Lists rebuild their array every render (e.g. `pages.flat()`), so bail out
		// when the entries are the same objects in the same order — this keeps an
		// unchanged list from churning provider renders, while a refetched/edited
		// entry (new object reference) still flows through to the panel.
		setNavEntries((prev) => {
			const next = entries ?? [];
			if (prev.length === next.length && prev.every((e, i) => e === next[i])) {
				return prev;
			}
			return next;
		});
	}, []);
	const close = useCallback(() => setState(null), []);
	const closePanel = useCallback(() => setSelection(null), []);

	// Held in a ref: registering a supplier must not re-render the provider or
	// re-bind the keydown listener.
	const prefillSourceRef = useRef<(() => CreatePrefillResult) | null>(null);
	const setCreatePrefillSource = useCallback(
		(source: (() => CreatePrefillResult) | null) => {
			prefillSourceRef.current = source;
		},
		[],
	);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.repeat || e.isComposing || e.defaultPrevented) return;
			if (isTypingTarget(e.target)) return;
			// Covers this dialog plus any other open dialog, confirmation, or
			// menu, where a bare keypress may be Radix typeahead input. The
			// detail panel is non-modal, so it doesn't block this shortcut.
			if (
				document.querySelector(
					'[role="dialog"], [role="alertdialog"], [role="menu"]',
				)
			) {
				return;
			}
			e.preventDefault();
			const result = prefillSourceRef.current?.() ?? null;
			if (result?.kind === "blocked") return;
			if (result?.kind === "prefill") {
				openCreate(result.prefill, { onCreated: result.onCreated });
			} else {
				openCreate();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [openCreate]);

	const viewEntryId = selection?.id ?? null;
	const value = useMemo(
		() => ({
			openCreate,
			openEdit,
			openView,
			viewEntryId,
			registerEntries,
			setCreatePrefillSource,
		}),
		[
			openCreate,
			openEdit,
			openView,
			viewEntryId,
			registerEntries,
			setCreatePrefillSource,
		],
	);

	// The entry form may only assign projects the caller can log to: workspace
	// admins/owners can use any, other members only the projects they belong to.
	// An entry being edited keeps its current project selectable regardless.
	const canLogToAll = current?.role === "owner" || current?.role === "admin";
	const myProjectIds = useQuery({
		queryKey: ["my-projects", current?.id],
		queryFn: () => api.listMyProjectIds(current?.id as string),
		enabled: Boolean(current) && !canLogToAll,
	});
	const editingProjectId =
		state?.mode === "edit" ? state.entry.projectId : null;
	const formProjects = useMemo(() => {
		const all = projects.data ?? [];
		if (canLogToAll) return all;
		const allowed = new Set(myProjectIds.data ?? []);
		return all.filter((p) => allowed.has(p.id) || p.id === editingProjectId);
	}, [projects.data, canLogToAll, myProjectIds.data, editingProjectId]);

	// Resolve the panel's entry against the live list so edits refetched into the
	// list flow through; fall back to the object we opened with (an entry opened
	// from search may not be in the current list).
	const navIndex = selection
		? navEntries.findIndex((e) => e.id === selection.id)
		: -1;
	const viewEntry = selection
		? (navEntries[navIndex] ?? selection.entry)
		: null;

	// Move the selection to an adjacent entry (prev/next), staying on the list.
	const goRelative = useCallback(
		(delta: number) => {
			setSelection((cur) => {
				if (!cur) return cur;
				const i = navEntries.findIndex((e) => e.id === cur.id);
				if (i < 0) return cur;
				const next = navEntries[i + delta];
				return next ? { id: next.id, entry: next } : cur;
			});
		},
		[navEntries],
	);
	// After deleting the selected entry, land on a neighbour (or close if none).
	const selectNeighbor = useCallback(() => {
		setSelection((cur) => {
			if (!cur) return null;
			const i = navEntries.findIndex((e) => e.id === cur.id);
			if (i < 0) return null;
			const neighbor = navEntries[i + 1] ?? navEntries[i - 1];
			return neighbor && neighbor.id !== cur.id
				? { id: neighbor.id, entry: neighbor }
				: null;
		});
	}, [navEntries]);

	return (
		<EntryDialogContext.Provider value={value}>
			{children}
			{current && viewEntry && onPanelRoute && (
				<EntryDetailPanel
					entry={viewEntry}
					index={navIndex}
					total={navEntries.length}
					onPrev={navIndex > 0 ? () => goRelative(-1) : undefined}
					onNext={
						navIndex >= 0 && navIndex < navEntries.length - 1
							? () => goRelative(1)
							: undefined
					}
					onEdit={() => openEdit(viewEntry)}
					onClose={closePanel}
					onDeleted={selectNeighbor}
				/>
			)}
			{current && (
				<Dialog open={state !== null} onOpenChange={(open) => !open && close()}>
					<DialogContent size="2xl">
						<DialogHeader>
							<DialogTitle>
								{state?.mode === "edit"
									? t("entries.editTitle")
									: t("entries.newTitle")}
							</DialogTitle>
							<DialogDescription>
								{state?.mode === "edit"
									? t("entries.editDescription")
									: t("entries.newDescription")}
							</DialogDescription>
						</DialogHeader>
						{state && (
							<EntryForm
								key={instanceId}
								workspaceId={current.id}
								timezone={timezone}
								projects={formProjects}
								initial={state.mode === "edit" ? state.entry : null}
								defaultProjectId={
									state.mode === "create" ? state.defaultProjectId : undefined
								}
								prefill={state.mode === "create" ? state.prefill : undefined}
								onSuccess={({ keepOpen }) => {
									toast.success(
										state.mode === "edit"
											? t("entries.toast.updated")
											: t("entries.toast.created"),
									);
									if (state.mode === "create") state.onCreated?.();
									if (!keepOpen) close();
								}}
								onCancel={close}
							/>
						)}
					</DialogContent>
				</Dialog>
			)}
		</EntryDialogContext.Provider>
	);
}
