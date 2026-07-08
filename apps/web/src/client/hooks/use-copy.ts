import { useEffect, useRef, useState } from "react";

/**
 * Clipboard-copy state with a brief "copied" flag. Callers render their own
 * chrome (a sidebar action, a dropdown icon, …) and flip an icon on `copied`.
 * The flag resets after 1600ms; the timer is cleared on unmount.
 */
export function useCopy() {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => () => clearTimeout(timer.current), []);

	const copy = async (value: string) => {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			// Clipboard can reject (denied permission, insecure context). Treat it
			// as a no-op instead of leaking an unhandled rejection from the
			// fire-and-forget click handlers, and don't flip to "copied".
			return;
		}
		setCopied(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 1600);
	};

	return { copied, copy };
}
