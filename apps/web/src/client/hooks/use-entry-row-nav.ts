import type { WorkEntry } from "@spantail/core";
import { type RefObject, useEffect, useState } from "react";

import { useEntryDialog } from "@/components/entry-dialog";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";

/**
 * Wires an entry list (home timeline / project table) to the docked detail
 * panel: registers the list's ordered entries so the panel can move through
 * them, drives the row highlight, and opens/updates the panel from the
 * keyboard. While the panel is open the highlight follows the selected entry
 * (single source of truth) and the arrow keys move the selection live; while it
 * is closed the list keeps its own `j`/`k` highlight and `o`/click to open.
 *
 * Only one entry list is mounted at a time (home and project are separate
 * routes), so registration never has to arbitrate between lists.
 */
export function useEntryRowNav<E extends HTMLElement>(
	entries: WorkEntry[],
	containerRef: RefObject<E | null>,
	onLoadMore?: () => void,
): { activeIndex: number } {
	const { openView, viewEntryId, registerEntries } = useEntryDialog();
	const [localActive, setLocalActive] = useState(-1);

	// The panel drives this list only when its entry is actually a row here.
	// An entry opened from elsewhere (e.g. the search palette) that isn't in
	// this list leaves the list on its own local highlight — it must not steal
	// the arrow keys from page scrolling or jump the panel to a random row.
	const panelIndex = viewEntryId
		? entries.findIndex((e) => e.id === viewEntryId)
		: -1;
	const panelDrivesList = panelIndex >= 0;
	const activeIndex = panelDrivesList ? panelIndex : localActive;

	// While the panel drives the list, mirror its selection into the local
	// highlight, so closing the panel leaves the highlight on the last-viewed row
	// (and j/k resumes from there) instead of snapping back to a stale index.
	useEffect(() => {
		if (panelDrivesList) setLocalActive(panelIndex);
	}, [panelDrivesList, panelIndex]);

	// Keep the panel's navigation list tracking what this list currently shows
	// (order, pagination). Register on change; clear only on unmount so a
	// re-render never briefly blanks the list under an open panel.
	useEffect(() => {
		registerEntries(entries);
	}, [entries, registerEntries]);
	useEffect(() => () => registerEntries(null), [registerEntries]);

	useListKeyboardNav({
		length: entries.length,
		index: activeIndex,
		arrowKeys: panelDrivesList,
		onMove: (next) => {
			const entry = entries[next];
			if (!entry) return;
			if (panelDrivesList) openView(entry);
			else setLocalActive(next);
		},
		onOpen: () => {
			const entry = entries[activeIndex];
			if (entry) openView(entry);
		},
		onReachEnd: onLoadMore,
		containerRef,
	});

	return { activeIndex };
}
