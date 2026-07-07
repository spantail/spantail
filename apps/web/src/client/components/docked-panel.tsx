import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import {
	type ComponentType,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";

import { Button } from "@/components/ui/button";
import { isTypingTarget } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 340;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 420;
// Shared across every docked panel (work-entry, agent session) so dragging one
// sets the width the others open at — they read as the same surface.
const WIDTH_KEY = "spantail-entry-panel-width";

/** Entity-neutral chrome labels, injected by the caller for i18n. */
export interface DockedPanelLabels {
	prev: string;
	next: string;
	close: string;
	resize: string;
	moveHint: string;
}

interface DockedPanelProps {
	/** Rendered as an `<h2>` at the top of the scrollable body. */
	title: ReactNode;
	/** Position in the caller's list, or -1 when the item isn't a row in it. */
	index: number;
	/** Size of the caller's list. The counter/hint show only when `index >= 0`. */
	total: number;
	onPrev?: () => void;
	onNext?: () => void;
	onClose: () => void;
	labels: DockedPanelLabels;
	/** Optional action bar pinned to the bottom (e.g. edit/delete). */
	footer?: ReactNode;
	children: ReactNode;
}

/**
 * Persistent, non-modal detail panel docked at the right edge, shared by the
 * work-entry and agent-session detail panels. Unlike a dialog it does not trap
 * focus or block the page, so the underlying lists' keyboard nav and row clicks
 * keep working — you move through items (↑/↓, prev/next, or by clicking a row)
 * without any open/close friction. The shell owns the frame, drag-resize, Esc
 * close, and header nav; callers supply the title, body, footer, and labels.
 */
export function DockedPanel({
	title,
	index,
	total,
	onPrev,
	onNext,
	onClose,
	labels,
	footer,
	children,
}: DockedPanelProps) {
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
			aria-labelledby="docked-panel-title"
			className="bg-card fixed top-0 right-0 bottom-0 z-30 flex max-w-[92vw] flex-col border-l shadow-2xl"
			style={{ width: `${width}px` }}
		>
			{/* resize handle — drag the left edge */}
			<button
				type="button"
				aria-label={labels.resize}
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
						label={labels.prev}
						onClick={onPrev}
						disabled={!onPrev}
					/>
					<NavBtn
						icon={ChevronDownIcon}
						label={labels.next}
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
						{labels.moveHint}
					</span>
				)}
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					aria-label={labels.close}
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
					id="docked-panel-title"
					className="font-heading mb-4 text-base leading-snug font-semibold"
				>
					{title}
				</h2>
				{children}
			</div>

			{footer && (
				<div className="bg-muted/50 flex shrink-0 items-center gap-2 border-t px-5 py-3">
					{footer}
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
