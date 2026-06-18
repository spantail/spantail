import { useQuery } from "@tanstack/react-query";
import { useRouteContext, useRouterState } from "@tanstack/react-router";
import { formatDuration, utcToZonedTime, type WorkEntry } from "@toxil/core";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EntryDetail } from "@/components/entry-detail";
import { EntryDetailActions } from "@/components/entry-detail-actions";
import { EntryForm } from "@/components/entry-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { formatEntryDate } from "@/lib/format";
import { isTypingTarget } from "@/lib/keyboard";
import { useWorkspace } from "@/lib/workspace";

type EntryDialogState =
	| { mode: "create"; defaultProjectId?: string }
	| { mode: "edit"; entry: WorkEntry }
	| { mode: "view"; entry: WorkEntry };

interface EntryDialogContextValue {
	openCreate: () => void;
	openEdit: (entry: WorkEntry) => void;
	openView: (entry: WorkEntry) => void;
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

	const openCreate = useCallback(() => {
		if (!hasWorkspace) return;
		setInstanceId((id) => id + 1);
		setState({ mode: "create", defaultProjectId: contextProjectId });
	}, [hasWorkspace, contextProjectId]);
	const openEdit = useCallback((entry: WorkEntry) => {
		setInstanceId((id) => id + 1);
		setState({ mode: "edit", entry });
	}, []);
	const openView = useCallback((entry: WorkEntry) => {
		setInstanceId((id) => id + 1);
		setState({ mode: "view", entry });
	}, []);
	const close = useCallback(() => setState(null), []);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.repeat || e.isComposing || e.defaultPrevented) return;
			if (isTypingTarget(e.target)) return;
			// Covers this dialog plus any other open dialog or menu, where a
			// bare keypress may be Radix typeahead input.
			if (document.querySelector('[role="dialog"], [role="menu"]')) return;
			e.preventDefault();
			openCreate();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [openCreate]);

	const value = useMemo(
		() => ({ openCreate, openEdit, openView }),
		[openCreate, openEdit, openView],
	);

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
	const viewProjectName = viewEntry
		? ((projects.data ?? []).find((p) => p.id === viewEntry.projectId)?.name ??
			viewEntry.projectId)
		: "";
	const viewDateLabel = viewEntry
		? formatEntryDate(viewEntry.entryDate, i18n.language, {
				year: "numeric",
				month: "short",
				day: "numeric",
				weekday: "short",
			})
		: "";
	const viewTimeRange =
		viewEntry?.startedAt && viewEntry.endedAt && current
			? `${utcToZonedTime(viewEntry.startedAt, current.timezone)}–${utcToZonedTime(viewEntry.endedAt, current.timezone)}`
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
					<DialogContent size="2xl">
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
								timezone={current.timezone}
								projects={projects.data ?? []}
								initial={state.mode === "edit" ? state.entry : null}
								defaultProjectId={
									state.mode === "create" ? state.defaultProjectId : undefined
								}
								onSuccess={() => {
									toast.success(
										state.mode === "edit"
											? t("entries.toast.updated")
											: t("entries.toast.created"),
									);
									close();
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
