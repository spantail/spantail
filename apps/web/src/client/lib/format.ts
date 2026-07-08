// Locale-aware date/range/timestamp formatters live in @spantail/core so the
// SPA, the report engine, and the CLI share one display policy. Re-exported here
// as the client's single import site for human-facing date/time formatting;
// pass `i18n.language` as the locale and `useToday()` as `now`. Clock and
// relative-time helpers below are web-only (feeds and session rows).
export {
	formatDateRange,
	formatDay,
	formatInstantDate,
	formatTimestamp,
} from "@spantail/core";

// Constructing an Intl formatter is relatively costly, and these run once per
// token cell / session-row time in large tables — so build each once and reuse.
const compactNumberFormat = new Intl.NumberFormat("en", {
	notation: "compact",
	maximumFractionDigits: 1,
});

/**
 * Compact token/count label: `27.5M`, `406K`, `980`. Always Latin K/M/B
 * suffixes (fixed `en` locale — these are raw engineering counts, not prose,
 * so they read the same across the app's locales). `Intl` compact notation
 * promotes at the threshold, so 999,999 reads `1M`, never `1000K`.
 */
export function formatCompactNumber(n: number): string {
	return compactNumberFormat.format(n);
}

// One clock formatter per timezone (workspaces rarely use more than one).
const clockFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * Wall-clock `HH:MM` (24h) for a UTC ISO timestamp, rendered in the viewer's
 * timezone so a session's start/end read in the user's local working hours.
 */
export function formatClock(iso: string, timeZone: string): string {
	let format = clockFormats.get(timeZone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
			timeZone,
		});
		clockFormats.set(timeZone, format);
	}
	return format.format(new Date(iso));
}

/**
 * Formats an ISO timestamp as a GitHub-inbox-style relative time
 * ("37 minutes ago", "yesterday", "2 days ago"), localized via
 * `Intl.RelativeTimeFormat` so en/ja need no extra catalog strings.
 */
export function formatRelativeTime(iso: string, locale: string): string {
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	const diffMs = new Date(iso).getTime() - Date.now();
	const minutes = Math.round(diffMs / 60_000);
	const absMin = Math.abs(minutes);
	if (absMin < 60) return rtf.format(minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
	const days = Math.round(hours / 24);
	if (Math.abs(days) < 7) return rtf.format(days, "day");
	return rtf.format(Math.round(days / 7), "week");
}
