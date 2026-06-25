import { useEffect } from "react";

/**
 * Sets `document.title` to the given value once it resolves. While the title is
 * still loading (`undefined`/empty) the current title is left untouched, so the
 * generic fallback never flashes between page transitions; each page overwrites
 * it as soon as its own data is available.
 */
export function useDocumentTitle(title: string | null | undefined) {
	useEffect(() => {
		if (title) document.title = title;
	}, [title]);
}
