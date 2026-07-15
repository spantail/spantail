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
	/** `x` pressed on the active item — toggle its selection. */
	onToggle?: () => void;
	/**
	 * Single-key actions on the active item, keyed by `KeyboardEvent.key`. Each
	 * fires once per press (respects `e.repeat`) and only with an active row.
	 * Kept generic — the caller supplies the keys and their meaning.
	 */
	actionKeys?: Record<string, () => void>;
	/** `j` pressed at the last item — a chance to load the next page. */
	onReachEnd?: () => void;
	/** Wraps the rows; each carries `data-nav-index={i}` for scroll-into-view. */
	containerRef: RefObject<E | null>;
	enabled?: boolean;
	/**
	 * Also treat `ArrowDown`/`ArrowUp` as `j`/`k`. Opt-in (default off) because
	 * most lists should leave the arrows to the browser for page scrolling; the
	 * entry lists enable it only while the detail panel is open, where the arrows
	 * are the panel's move keys.
	 */
	arrowKeys?: boolean;
}

/**
 * Vim-style list navigation: `j`/`k` move the selection, `o` opens it, `x`
 * toggles it (where the list supports selection). One `window` keydown
 * listener, guarded like the app's other global shortcuts (yields to text
 * inputs and to any open dialog/menu). The active row is scrolled into view
 * whenever `index` changes.
 */
export function useListKeyboardNav<E extends HTMLElement>({
	length,
	index,
	onMove,
	onOpen,
	onToggle,
	actionKeys,
	onReachEnd,
	containerRef,
	enabled = true,
	arrowKeys = false,
}: UseListKeyboardNavOptions<E>): void {
	// Latest values, read inside a listener that's bound once per `enabled`.
	// Synced in a layout effect (not during render) so the handler only ever
	// observes values from a committed render — safe under concurrent rendering.
	const latest = useRef({
		length,
		index,
		onMove,
		onOpen,
		onToggle,
		actionKeys,
		onReachEnd,
		arrowKeys,
	});
	useLayoutEffect(() => {
		latest.current = {
			length,
			index,
			onMove,
			onOpen,
			onToggle,
			actionKeys,
			onReachEnd,
			arrowKeys,
		};
	});

	useEffect(() => {
		if (!enabled) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
			if (e.defaultPrevented || isTypingTarget(e.target)) return;
			// Inert while a dialog/menu is open: a bare key may be Radix typeahead,
			// and mutating the list behind a confirmation dialog would let the
			// confirm act on a different set than the one it described.
			if (
				document.querySelector(
					'[role="dialog"], [role="alertdialog"], [role="menu"]',
				)
			) {
				return;
			}
			const {
				length,
				index,
				onMove,
				onOpen,
				onToggle,
				actionKeys,
				onReachEnd,
				arrowKeys,
			} = latest.current;
			const isDown = e.key === "j" || (arrowKeys && e.key === "ArrowDown");
			const isUp = e.key === "k" || (arrowKeys && e.key === "ArrowUp");
			if (isDown || isUp) {
				if (length === 0) return;
				e.preventDefault();
				const dir = isDown ? 1 : -1;
				if (dir === 1 && index >= length - 1) onReachEnd?.();
				const next = nextNavIndex(index, length, dir);
				if (next !== index) onMove(next);
			} else if (e.key === "o" && onOpen && !e.repeat) {
				if (index < 0) return;
				e.preventDefault();
				onOpen();
			} else if (e.key === "x" && onToggle && !e.repeat) {
				if (index < 0) return;
				e.preventDefault();
				onToggle();
			} else if (!e.repeat && actionKeys && Object.hasOwn(actionKeys, e.key)) {
				if (index < 0) return;
				e.preventDefault();
				actionKeys[e.key]?.();
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
