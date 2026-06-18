/** True when the event target is an editable field, so global key shortcuts
 *  should yield to text input. */
export function isTypingTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
	);
}

/** Next selection index in a list of `length` items when moving `dir` (1 = down,
 *  -1 = up). Clamps at both ends; from "none" (-1) moving down lands on the first
 *  item. Returns -1 only for an empty list. */
export function nextNavIndex(
	current: number,
	length: number,
	dir: 1 | -1,
): number {
	if (length === 0) return -1;
	if (current < 0) return dir === 1 ? 0 : length - 1;
	return Math.min(length - 1, Math.max(0, current + dir));
}
