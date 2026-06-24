import { formatDuration, utcToZonedTime, type WorkSpan } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext, useRouterState } from "@tanstack/react-router";
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

import { SpanDetail } from "@/components/span-detail";
import { SpanDetailActions } from "@/components/span-detail-actions";
import { SpanForm } from "@/components/span-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useProjects } from "@/hooks/use-projects";
import { api } from "@/lib/api";
import { formatSpanDate } from "@/lib/format";
import { isTypingTarget } from "@/lib/keyboard";
import { useWorkspace } from "@/lib/workspace";

type SpanDialogState =
	| { mode: "create"; defaultProjectId?: string }
	| { mode: "edit"; span: WorkSpan }
	| { mode: "view"; span: WorkSpan };

interface SpanDialogContextValue {
	openCreate: () => void;
	openEdit: (span: WorkSpan) => void;
	openView: (span: WorkSpan) => void;
}

const SpanDialogContext = createContext<SpanDialogContextValue | null>(null);

export function useSpanDialog(): SpanDialogContextValue {
	const value = useContext(SpanDialogContext);
	if (!value)
		throw new Error("useSpanDialog must be used inside SpanDialogProvider");
	return value;
}

export function SpanDialogProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { t, i18n } = useTranslation();
	const { current } = useWorkspace();
	const { session } = useRouteContext({ from: "/_authed" });
	const projects = useProjects();
	const [state, setState] = useState<SpanDialogState | null>(null);
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
	const openEdit = useCallback((span: WorkSpan) => {
		setInstanceId((id) => id + 1);
		setState({ mode: "edit", span });
	}, []);
	const openView = useCallback((span: WorkSpan) => {
		setInstanceId((id) => id + 1);
		setState({ mode: "view", span });
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

	// In view mode the span's description is the dialog title; project, date,
	// duration, tags and note make up the body. The author byline (and the
	// member lookup it needs) only applies to spans the viewer doesn't own.
	const viewSpan = state?.mode === "view" ? state.span : null;
	const isOthersSpan = viewSpan != null && viewSpan.userId !== session.user.id;
	const members = useQuery({
		queryKey: ["members", current?.id],
		queryFn: () => api.listMembers(current?.id as string),
		enabled: Boolean(current) && isOthersSpan,
	});
	const viewProject = viewSpan?.projectId
		? (projects.data ?? []).find((p) => p.id === viewSpan.projectId)
		: undefined;
	const viewProjectName = viewSpan
		? viewSpan.projectId
			? (viewProject?.name ?? viewSpan.projectId)
			: t("projects.unassigned")
		: "";
	const viewProjectHue = viewProject?.hue ?? null;
	const viewDateLabel = viewSpan
		? formatSpanDate(viewSpan.spanDate, i18n.language, {
				year: "numeric",
				month: "short",
				day: "numeric",
				weekday: "short",
			})
		: "";
	const viewTimeRange =
		viewSpan?.startedAt && viewSpan.endedAt && current
			? `${utcToZonedTime(viewSpan.startedAt, current.timezone)}–${utcToZonedTime(viewSpan.endedAt, current.timezone)}`
			: null;
	// Resolve to the member's name only; while members load (or for a user no
	// longer in the workspace) the byline stays hidden rather than show a raw id.
	const viewAuthorName = isOthersSpan
		? ((members.data ?? []).find((m) => m.userId === viewSpan?.userId)?.name ??
			null)
		: null;
	// Concise summary kept for the (visually hidden) dialog description.
	const viewSubtitle = viewSpan
		? [
				viewProjectName,
				viewDateLabel,
				formatDuration(viewSpan.durationMinutes),
			].join(" · ")
		: null;

	return (
		<SpanDialogContext.Provider value={value}>
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
								{viewSpan
									? viewSpan.description
									: state?.mode === "edit"
										? t("spans.editTitle")
										: t("spans.newTitle")}
							</DialogTitle>
							<DialogDescription className={viewSpan ? "sr-only" : undefined}>
								{viewSubtitle ??
									(state?.mode === "edit"
										? t("spans.editDescription")
										: t("spans.newDescription"))}
							</DialogDescription>
						</DialogHeader>
						{state?.mode === "view" && (
							<>
								<SpanDetail
									span={state.span}
									projectName={viewProjectName}
									projectHue={viewProjectHue}
									dateLabel={viewDateLabel}
									timeRange={viewTimeRange}
									authorName={viewAuthorName}
								/>
								<SpanDetailActions
									span={state.span}
									onEdit={() => openEdit(state.span)}
									onClose={close}
								/>
							</>
						)}
						{state && state.mode !== "view" && (
							<SpanForm
								key={instanceId}
								workspaceId={current.id}
								timezone={current.timezone}
								projects={projects.data ?? []}
								initial={state.mode === "edit" ? state.span : null}
								defaultProjectId={
									state.mode === "create" ? state.defaultProjectId : undefined
								}
								onSuccess={() => {
									toast.success(
										state.mode === "edit"
											? t("spans.toast.updated")
											: t("spans.toast.created"),
									);
									close();
								}}
								onCancel={close}
							/>
						)}
					</DialogContent>
				</Dialog>
			)}
		</SpanDialogContext.Provider>
	);
}
