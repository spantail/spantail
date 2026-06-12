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
