import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

import { isTypingTarget, nextNavIndex } from "@/lib/keyboard";

interface UseListKeyboardNavOptions<E extends HTMLElement> {
	/** Number of loaded items. */
	length: number;
	/** Current active index (-1 = none), derived by the caller. */
	index: number;
	/** Move the selection to `nextIndex` (local state, or a route navigation). */
	onMove: (nextIndex: number) => void;
	/** `o` pressed on the active item. Omit where moving already opens. */
	onOpen?: () => void;
	/** `j` pressed at the last item — a chance to load the next page. */
	onReachEnd?: () => void;
	/** Wraps the rows; each carries `data-nav-index={i}` for scroll-into-view. */
	containerRef: RefObject<E | null>;
	enabled?: boolean;
}

/**
 * Vim-style list navigation: `j`/`k` move the selection, `o` opens it. One
 * `window` keydown listener, guarded like the app's other global shortcuts
 * (yields to text inputs and to any open dialog/menu). The active row is
 * scrolled into view whenever `index` changes.
 */
export function useListKeyboardNav<E extends HTMLElement>({
	length,
	index,
	onMove,
	onOpen,
	onReachEnd,
	containerRef,
	enabled = true,
}: UseListKeyboardNavOptions<E>): void {
	// Latest values, read inside a listener that's bound once per `enabled`.
	// Synced in a layout effect (not during render) so the handler only ever
	// observes values from a committed render — safe under concurrent rendering.
	const latest = useRef({ length, index, onMove, onOpen, onReachEnd });
	useLayoutEffect(() => {
		latest.current = { length, index, onMove, onOpen, onReachEnd };
	});

	useEffect(() => {
		if (!enabled) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
			if (e.defaultPrevented || isTypingTarget(e.target)) return;
			// Inert while a dialog/menu is open: a bare key may be Radix typeahead.
			if (document.querySelector('[role="dialog"], [role="menu"]')) return;
			const { length, index, onMove, onOpen, onReachEnd } = latest.current;
			if (e.key === "j" || e.key === "k") {
				if (length === 0) return;
				e.preventDefault();
				const dir = e.key === "j" ? 1 : -1;
				if (dir === 1 && index >= length - 1) onReachEnd?.();
				const next = nextNavIndex(index, length, dir);
				if (next !== index) onMove(next);
			} else if (e.key === "o" && onOpen && !e.repeat) {
				if (index < 0) return;
				e.preventDefault();
				onOpen();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [enabled]);

	useEffect(() => {
		if (index < 0) return;
		containerRef.current
			?.querySelector(`[data-nav-index="${index}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [index, containerRef]);
}
