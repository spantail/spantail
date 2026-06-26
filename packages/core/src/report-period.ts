import { type AbsoluteDateRange, lastDayOfMonth } from "./report";

/**
 * Compact label for a resolved period: `2026-06` for an exact calendar
 * month, `2026-06-13` for a single day, `2026-06-01 – 2026-06-07` otherwise.
 * Clients compose snapshot display names as `{report.name} {label}`.
 */
export function formatPeriodLabel(range: AbsoluteDateRange): string {
	if (range.from === range.to) return range.from;
	const [y = 0, m = 1] = range.from.split("-").map(Number);
	if (range.from.endsWith("-01") && range.to === lastDayOfMonth(y, m - 1)) {
		return range.from.slice(0, 7);
	}
	return `${range.from} – ${range.to}`;
}
