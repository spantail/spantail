import { utcToZonedTime, type WorkEntry } from "@spantail/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import {
	ChevronDownIcon,
	ChevronUpIcon,
	PencilIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import {
	type ComponentType,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";

import { EntryDetail } from "@/components/entry-detail";
import { Button } from "@/components/ui/button";
import { useDeleteWorkEntry } from "@/hooks/use-delete-work-entry";
import { useProjects } from "@/hooks/use-projects";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { api } from "@/lib/api";
import { formatEntryDate } from "@/lib/format";
import { isTypingTarget } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

const MIN_WIDTH = 340;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 420;
const WIDTH_KEY = "spantail-entry-panel-width";

interface EntryDetailPanelProps {
	entry: WorkEntry;
	/** Position of `entry` in the registered list, or -1 when it isn't in it. */
	index: number;
	/**
	 * Size of the registered list. Independent of `index`: it can be > 0 while
	 * `index` is -1 — an entry opened from elsewhere (e.g. search) that isn't a
	 * row in the list that happens to be mounted. The counter/nav use `index`,
	 * not `total`, to decide whether the entry is navigable.
	 */
	total: number;
	onPrev?: () => void;
	onNext?: () => void;
	onEdit: () => void;
	onClose: () => void;
	/** Called after the entry is deleted (advances the selection or closes). */
	onDeleted: () => void;
}

/**
 * Persistent, non-modal detail panel docked at the right edge. Unlike the
 * create/edit dialog it does not trap focus or block the page, so the entry
 * lists' keyboard nav and row clicks keep working — you move through entries
 * (↑/↓, prev/next, or by clicking a row) without any open/close friction. The
 * body is the same read-only {@link EntryDetail} used by the dialog before.
 */
export function EntryDetailPanel({
	entry,
	index,
	total,
	onPrev,
	onNext,
	onEdit,
	onClose,
	onDeleted,
}: EntryDetailPanelProps) {
	const { t, i18n } = useTranslation();
	const { current } = useWorkspace();
	const { session } = useRouteContext({ from: "/_authed" });
	const timezone = useUserTimezone();
	const projects = useProjects();
	const deleteMutation = useDeleteWorkEntry(entry, onDeleted);

	const isOwn = entry.userId === session.user.id;

	// Author byline (and the member lookup it needs) only applies to entries the
	// viewer doesn't own.
	const members = useQuery({
		queryKey: ["members", current?.id],
		queryFn: () => api.listMembers(current?.id as string),
		enabled: Boolean(current) && !isOwn,
	});
	// Agent sessions this entry was logged from — gated on the instance feature
	// flag. The server filters by the agent-entry ACL, so a viewer sees only
	// sessions they may read.
	const agentsEnabled = useQuery({
		queryKey: ["agents-enabled"],
		queryFn: () => api.getAgentsEnabled(),
	});
	const linkedSessions = useQuery({
		queryKey: ["work-entry-agent-entries", current?.id, entry.id],
		queryFn: () => api.listWorkEntryAgentEntries(entry.id),
		enabled: Boolean(current) && (agentsEnabled.data?.enabled ?? false),
	});
	// Resolves the sessions' agentId to a display name for the activity card.
	const workspaceAgents = useQuery({
		queryKey: ["workspace-agents", current?.id],
		queryFn: () => api.listWorkspaceAgents(current?.id as string),
		enabled: Boolean(current) && (agentsEnabled.data?.enabled ?? false),
	});
	// Identify the agent behind the card only when every session shares one.
	const agent = useMemo(() => {
		const sessions = linkedSessions.data ?? [];
		const ids = [...new Set(sessions.map((s) => s.agentId))];
		if (ids.length !== 1) return null;
		return (workspaceAgents.data ?? []).find((a) => a.id === ids[0]) ?? null;
	}, [linkedSessions.data, workspaceAgents.data]);

	const project = entry.projectId
		? (projects.data ?? []).find((p) => p.id === entry.projectId)
		: undefined;
	const projectName = entry.projectId
		? (project?.name ?? entry.projectId)
		: t("projects.unassigned");
	const dateLabel = formatEntryDate(entry.entryDate, i18n.language, {
		year: "numeric",
		month: "short",
		day: "numeric",
		weekday: "short",
	});
	const timeRange =
		entry.startedAt && entry.endedAt
			? `${utcToZonedTime(entry.startedAt, timezone)}–${utcToZonedTime(entry.endedAt, timezone)}`
			: null;
	const authorName = isOwn
		? null
		: ((members.data ?? []).find((m) => m.userId === entry.userId)?.name ??
			null);

	// Draggable width. Persisted at the end of a drag (not on every move — that
	// would hit synchronous localStorage on each pointer-move and jank the drag).
	const [width, setWidth] = useState(() => {
		const v = Number.parseInt(localStorage.getItem(WIDTH_KEY) ?? "", 10);
		return v >= MIN_WIDTH && v <= MAX_WIDTH ? v : DEFAULT_WIDTH;
	});
	const widthRef = useRef(width);
	const [resizing, setResizing] = useState(false);
	// Detaches an in-progress drag's listeners and saves the final width; kept in
	// a ref so unmounting mid-drag (e.g. a delete lands and closes the panel) can
	// clean up. It never touches React state, so the unmount path stays safe.
	const detachResizeRef = useRef<(() => void) | null>(null);
	useEffect(() => () => detachResizeRef.current?.(), []);
	const startResize = (e: React.PointerEvent) => {
		e.preventDefault();
		// Tear down any drag already in progress (e.g. a second touch on the
		// handle before the first lifts) so its listeners don't leak.
		detachResizeRef.current?.();
		setResizing(true);
		const onMove = (ev: PointerEvent) => {
			const w = Math.max(
				MIN_WIDTH,
				Math.min(MAX_WIDTH, Math.round(window.innerWidth - ev.clientX)),
			);
			widthRef.current = w;
			setWidth(w);
		};
		const detach = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
			document.body.style.userSelect = "";
			localStorage.setItem(WIDTH_KEY, String(widthRef.current));
			detachResizeRef.current = null;
		};
		function onUp() {
			detach();
			setResizing(false);
		}
		detachResizeRef.current = detach;
		document.body.style.userSelect = "none";
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		// A cancelled pointer (touch-scroll takeover, OS gesture, lost capture)
		// never fires pointerup — end the drag on it too, so the move listener and
		// `user-select: none` don't leak.
		window.addEventListener("pointercancel", onUp);
	};

	// Esc closes the panel — but only when nothing more modal is open (an
	// edit/create dialog or a menu owns Escape first).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			// Leave Escape to whatever the user is typing in (clearing an input,
			// closing a combobox popover) or to a more modal surface above.
			if (isTypingTarget(e.target)) return;
			if (
				document.querySelector(
					'[role="dialog"], [role="alertdialog"], [role="menu"]',
				)
			) {
				return;
			}
			onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const inList = index >= 0;

	return (
		<aside
			aria-labelledby="entry-panel-title"
			className="bg-card fixed top-0 right-0 bottom-0 z-30 flex max-w-[92vw] flex-col border-l shadow-2xl"
			style={{ width: `${width}px` }}
		>
			{/* resize handle — drag the left edge */}
			<button
				type="button"
				aria-label={t("entries.panel.resize")}
				onPointerDown={startResize}
				className="group absolute top-0 bottom-0 left-0 z-10 flex w-2 -translate-x-1/2 cursor-col-resize items-center justify-center"
			>
				<span
					className={cn(
						"h-10 w-1 rounded-full transition-colors",
						resizing ? "bg-brand" : "bg-border group-hover:bg-foreground/30",
					)}
				/>
			</button>

			<div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
				<div className="flex items-center gap-1">
					<NavBtn
						icon={ChevronUpIcon}
						label={t("entries.panel.prevEntry")}
						onClick={onPrev}
						disabled={!onPrev}
					/>
					<NavBtn
						icon={ChevronDownIcon}
						label={t("entries.panel.nextEntry")}
						onClick={onNext}
						disabled={!onNext}
					/>
				</div>
				{inList && (
					<span className="text-muted-foreground text-xs tabular-nums">
						{index + 1} / {total}
					</span>
				)}
				{inList && total > 1 && (
					<span className="text-muted-foreground ml-auto hidden items-center gap-1 text-[11px] lg:flex">
						<kbd className="bg-muted rounded border px-1 font-mono text-[10px]">
							↑
						</kbd>
						<kbd className="bg-muted rounded border px-1 font-mono text-[10px]">
							↓
						</kbd>
						{t("entries.panel.moveHint")}
					</span>
				)}
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					aria-label={t("entries.panel.close")}
					className={cn(
						"text-muted-foreground -mr-2",
						!(inList && total > 1) && "ml-auto",
					)}
				>
					<XIcon />
				</Button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
				<h2
					id="entry-panel-title"
					className="font-heading mb-4 text-base leading-snug font-semibold"
				>
					{entry.description}
				</h2>
				<EntryDetail
					entry={entry}
					projectName={projectName}
					projectHue={project?.hue ?? null}
					projectSymbol={project?.symbol ?? null}
					dateLabel={dateLabel}
					timeRange={timeRange}
					authorName={authorName}
					agentSessions={linkedSessions.data ?? []}
					agentName={agent?.name ?? null}
					agentType={agent?.type ?? null}
				/>
			</div>

			{isOwn && (
				<div className="bg-muted/50 flex shrink-0 items-center gap-2 border-t px-5 py-3">
					<Button
						variant="ghost"
						size="sm"
						disabled={deleteMutation.isPending}
						onClick={() => deleteMutation.mutate()}
						className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive mr-auto"
					>
						<Trash2Icon />
						{t("entries.deleteAction")}
					</Button>
					<Button size="sm" onClick={onEdit}>
						<PencilIcon />
						{t("entries.editAction")}
					</Button>
				</div>
			)}
		</aside>
	);
}

function NavBtn({
	icon: Icon,
	label,
	onClick,
	disabled,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	onClick?: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			className={cn(
				"flex size-7 items-center justify-center rounded-md border transition-colors",
				disabled
					? "text-muted-foreground opacity-40"
					: "text-muted-foreground hover:bg-accent hover:text-foreground",
			)}
		>
			<Icon className="size-3.5" />
		</button>
	);
}
