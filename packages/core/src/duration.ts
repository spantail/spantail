/**
 * Upper bound for any stored duration, in minutes (one 365-day year). Ingested
 * durations are untrusted input (see docs/security.md §1): a value with no
 * plausible ceiling corrupts report totals and risks integer-range issues
 * downstream. Defined once here so web/CLI/MCP enforce the same cap.
 */
export const MAX_DURATION_MINUTES = 525_600;

/**
 * Parses a human duration into integer minutes: `"90"` (minutes), `"45m"`,
 * `"2h"`, `"1h30m"`, `"1h 30m"`, `"3.5h"` (fractional hours, rounded to the
 * nearest minute). Case-insensitive. Returns null for anything invalid or
 * non-positive; the caller owns the user-facing error message.
 */
export function parseDuration(input: string): number | null {
	const value = input.trim().toLowerCase();
	let minutes: number;
	if (/^\d+$/.test(value)) {
		minutes = Number(value);
	} else {
		const match = /^(?:(\d+(?:\.\d+)?)h)?(?: ?(\d+)m)?$/.exec(value);
		if (!match || (match[1] === undefined && match[2] === undefined))
			return null;
		minutes = Math.round(Number(match[1] ?? 0) * 60) + Number(match[2] ?? 0);
	}
	return Number.isSafeInteger(minutes) && minutes > 0 ? minutes : null;
}

/** Formats integer minutes as `2h 05m` / `45m` / `3h`. */
export function formatDuration(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Formats integer minutes as decimal hours, e.g. `65.9h` — for compact dials. */
export function formatHours(minutes: number): string {
	return `${(minutes / 60).toFixed(1)}h`;
}
