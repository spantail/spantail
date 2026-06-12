import type { WorkEntry } from "@toxil/core";
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

import { EntryForm } from "@/components/entry-form";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useProjects } from "@/hooks/use-projects";
import { useWorkspace } from "@/lib/workspace";

type EntryDialogState =
	| { mode: "create"; defaultProjectId?: string }
	| { mode: "edit"; entry: WorkEntry };

interface EntryDialogContextValue {
	openCreate: (defaults?: { projectId?: string }) => void;
	openEdit: (entry: WorkEntry) => void;
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
	const { t } = useTranslation();
	const { current } = useWorkspace();
	const projects = useProjects();
	const [state, setState] = useState<EntryDialogState | null>(null);
	// Remount key so the form re-derives its initial state on every open.
	const [instanceId, setInstanceId] = useState(0);
	const hasWorkspace = Boolean(current);

	const openCreate = useCallback(
		(defaults?: { projectId?: string }) => {
			if (!hasWorkspace) return;
			setInstanceId((id) => id + 1);
			setState({ mode: "create", defaultProjectId: defaults?.projectId });
		},
		[hasWorkspace],
	);
	const openEdit = useCallback((entry: WorkEntry) => {
		setInstanceId((id) => id + 1);
		setState({ mode: "edit", entry });
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
		() => ({ openCreate, openEdit }),
		[openCreate, openEdit],
	);

	return (
		<EntryDialogContext.Provider value={value}>
			{children}
			{current && (
				<Dialog open={state !== null} onOpenChange={(open) => !open && close()}>
					<DialogContent className="sm:max-w-lg">
						<DialogHeader>
							<DialogTitle className="font-heading">
								{state?.mode === "edit"
									? t("entries.editTitle")
									: t("entries.newTitle")}
							</DialogTitle>
						</DialogHeader>
						{state && (
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
