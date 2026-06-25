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
 * Compact label for an inclusive `YYYY-MM-DD` range, mirroring the dashboard
 * mockup: `Jun 1 – 30`, `May 28 – Jun 13`, or a single `Jun 1`. Same-month
 * ranges drop the repeated month on the end. Locale-aware (e.g. `ja` →
 * `6月1日 – 30日`). Dates are built from parts to avoid the `new Date(iso)` UTC shift.
 */
export function formatCompactRange(
	from: string,
	to: string,
	locale: string,
): string {
	const toDate = (s: string) => {
		const [y = 0, m = 1, d = 1] = s.split("-").map(Number);
		return new Date(y, m - 1, d);
	};
	const monthDay = new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
	});
	const a = toDate(from);
	if (from === to) return monthDay.format(a);
	const b = toDate(to);
	const sameMonth = from.slice(0, 7) === to.slice(0, 7);
	const end = sameMonth
		? new Intl.DateTimeFormat(locale, { day: "numeric" }).format(b)
		: monthDay.format(b);
	return `${monthDay.format(a)} – ${end}`;
}

/**
 * Compact token/count label: `27.5M`, `406K`, `980`. Always Latin K/M/B
 * suffixes (fixed `en` locale — these are raw engineering counts, not prose,
 * so they read the same across the app's locales). `Intl` compact notation
 * promotes at the threshold, so 999,999 reads `1M`, never `1000K`.
 */
export function formatCompactNumber(n: number): string {
	return new Intl.NumberFormat("en", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(n);
}

/**
 * Wall-clock `HH:MM` (24h) for a UTC ISO timestamp, rendered in the workspace
 * timezone so a session's start/end read in the user's local working hours.
 */
export function formatClock(iso: string, timeZone: string): string {
	return new Intl.DateTimeFormat("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZone,
	}).format(new Date(iso));
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
