import { formatDuration, utcToZonedTime, type WorkEntry } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext, useRouterState } from "@tanstack/react-router";
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

import { EntryDetail } from "@/components/entry-detail";
import { EntryDetailActions } from "@/components/entry-detail-actions";
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
import { formatEntryDate } from "@/lib/format";
import { isTypingTarget } from "@/lib/keyboard";
import { useWorkspace } from "@/lib/workspace";

type EntryDialogState =
	| {
			mode: "create";
			defaultProjectId?: string;
			prefill?: EntryCreatePrefill;
			onCreated?: () => void;
	  }
	| { mode: "edit"; entry: WorkEntry }
	| { mode: "view"; entry: WorkEntry };

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
	openView: (entry: WorkEntry) => void;
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
	const { t, i18n } = useTranslation();
	const { current } = useWorkspace();
	const { session } = useRouteContext({ from: "/_authed" });
	const timezone = useUserTimezone();
	const projects = useProjects();
	const [state, setState] = useState<EntryDialogState | null>(null);
	// Remount key so the form re-derives its initial state on every open.
	const [instanceId, setInstanceId] = useState(0);
	const hasWorkspace = Boolean(current);

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

	const openCreate = useCallback(
		(prefill?: EntryCreatePrefill, opts?: { onCreated?: () => void }) => {
			if (!hasWorkspace) return;
			setInstanceId((id) => id + 1);
			setState({
				mode: "create",
				defaultProjectId: contextProjectId,
				prefill,
				onCreated: opts?.onCreated,
			});
		},
		[hasWorkspace, contextProjectId],
	);
	const openEdit = useCallback((entry: WorkEntry) => {
		setInstanceId((id) => id + 1);
		setState({ mode: "edit", entry });
	}, []);
	const openView = useCallback((entry: WorkEntry) => {
		setInstanceId((id) => id + 1);
		setState({ mode: "view", entry });
	}, []);
	const close = useCallback(() => setState(null), []);

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
			// menu, where a bare keypress may be Radix typeahead input.
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

	const value = useMemo(
		() => ({ openCreate, openEdit, openView, setCreatePrefillSource }),
		[openCreate, openEdit, openView, setCreatePrefillSource],
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

	// In view mode the entry's description is the dialog title; project, date,
	// duration, tags and note make up the body. The author byline (and the
	// member lookup it needs) only applies to entries the viewer doesn't own.
	const viewEntry = state?.mode === "view" ? state.entry : null;
	const isOthersEntry =
		viewEntry != null && viewEntry.userId !== session.user.id;
	const members = useQuery({
		queryKey: ["members", current?.id],
		queryFn: () => api.listMembers(current?.id as string),
		enabled: Boolean(current) && isOthersEntry,
	});
	const viewProject = viewEntry?.projectId
		? (projects.data ?? []).find((p) => p.id === viewEntry.projectId)
		: undefined;
	const viewProjectName = viewEntry
		? viewEntry.projectId
			? (viewProject?.name ?? viewEntry.projectId)
			: t("projects.unassigned")
		: "";
	const viewProjectHue = viewProject?.hue ?? null;
	const viewProjectSymbol = viewProject?.symbol ?? null;
	const viewDateLabel = viewEntry
		? formatEntryDate(viewEntry.entryDate, i18n.language, {
				year: "numeric",
				month: "short",
				day: "numeric",
				weekday: "short",
			})
		: "";
	const viewTimeRange =
		viewEntry?.startedAt && viewEntry.endedAt
			? `${utcToZonedTime(viewEntry.startedAt, timezone)}–${utcToZonedTime(viewEntry.endedAt, timezone)}`
			: null;
	// Resolve to the member's name only; while members load (or for a user no
	// longer in the workspace) the byline stays hidden rather than show a raw id.
	const viewAuthorName = isOthersEntry
		? ((members.data ?? []).find((m) => m.userId === viewEntry?.userId)?.name ??
			null)
		: null;
	// Concise summary kept for the (visually hidden) dialog description.
	const viewSubtitle = viewEntry
		? [
				viewProjectName,
				viewDateLabel,
				formatDuration(viewEntry.durationMinutes),
			].join(" · ")
		: null;

	return (
		<EntryDialogContext.Provider value={value}>
			{children}
			{current && (
				<Dialog open={state !== null} onOpenChange={(open) => !open && close()}>
					<DialogContent
						size="2xl"
						onOpenAutoFocus={(e) => {
							if (state?.mode !== "view") return;
							// Radix focuses the first tabbable element by default — in
							// view mode that is the Delete button, making a stray Enter
							// destructive. Send focus to the close (X) button so Enter
							// merely dismisses.
							e.preventDefault();
							(e.currentTarget as HTMLElement)
								.querySelector<HTMLElement>('[data-slot="dialog-close"]')
								?.focus();
						}}
					>
						<DialogHeader>
							<DialogTitle>
								{viewEntry
									? viewEntry.description
									: state?.mode === "edit"
										? t("entries.editTitle")
										: t("entries.newTitle")}
							</DialogTitle>
							<DialogDescription className={viewEntry ? "sr-only" : undefined}>
								{viewSubtitle ??
									(state?.mode === "edit"
										? t("entries.editDescription")
										: t("entries.newDescription"))}
							</DialogDescription>
						</DialogHeader>
						{state?.mode === "view" && (
							<>
								<EntryDetail
									entry={state.entry}
									projectName={viewProjectName}
									projectHue={viewProjectHue}
									projectSymbol={viewProjectSymbol}
									dateLabel={viewDateLabel}
									timeRange={viewTimeRange}
									authorName={viewAuthorName}
								/>
								<EntryDetailActions
									entry={state.entry}
									onEdit={() => openEdit(state.entry)}
									onClose={close}
								/>
							</>
						)}
						{state && state.mode !== "view" && (
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
