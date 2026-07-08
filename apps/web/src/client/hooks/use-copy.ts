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
		await navigator.clipboard.writeText(value);
		setCopied(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 1600);
	};

	return { copied, copy };
}
