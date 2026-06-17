/**
 * Formats a `YYYY-MM-DD` local-date string for display. Builds the Date from
 * parts: `new Date("YYYY-MM-DD")` would parse as UTC midnight and shift a day
 * in behind-UTC locales.
 */
export function formatEntryDate(
	date: string,
	locale: string,
	options: Intl.DateTimeFormatOptions = {
		month: "short",
		day: "numeric",
		weekday: "short",
	},
): string {
	const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
	return new Intl.DateTimeFormat(locale, options).format(new Date(y, m - 1, d));
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
