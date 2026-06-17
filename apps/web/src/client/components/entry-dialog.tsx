import { useRouterState } from "@tanstack/react-router";
import { formatDuration, type WorkEntry } from "@toxil/core";
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
import { EntryForm } from "@/components/entry-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useProjects } from "@/hooks/use-projects";
import { formatEntryDate } from "@/lib/format";
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

function isTypingTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
	);
}

export function EntryDialogProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { t, i18n } = useTranslation();
	const { current } = useWorkspace();
	const projects = useProjects();
	const [state, setState] = useState<EntryDialogState | null>(null);
	// Remount key so the form re-derives its initial state on every open.
	const [instanceId, setInstanceId] = useState(0);
	const hasWorkspace = Boolean(current);

	// On a project page, creating pre-selects that project (only while it is
	// active — the form's select lists active projects only).
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const routeProjectId = pathname.startsWith("/projects/")
		? pathname.slice("/projects/".length)
		: undefined;
	const contextProjectId = (projects.data ?? []).some(
		(project) => project.id === routeProjectId && project.status === "active",
	)
		? routeProjectId
		: undefined;

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

	// In view mode the entry's description is the dialog title; project, date and
	// duration form the subtitle.
	const viewEntry = state?.mode === "view" ? state.entry : null;
	const viewSubtitle = viewEntry
		? [
				(projects.data ?? []).find((p) => p.id === viewEntry.projectId)?.name ??
					viewEntry.projectId,
				formatEntryDate(viewEntry.entryDate, i18n.language, {
					year: "numeric",
					month: "short",
					day: "numeric",
					weekday: "short",
				}),
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
							<DialogDescription>
								{viewSubtitle ??
									(state?.mode === "edit"
										? t("entries.editDescription")
										: t("entries.newDescription"))}
							</DialogDescription>
						</DialogHeader>
						{state?.mode === "view" && <EntryDetail entry={state.entry} />}
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
