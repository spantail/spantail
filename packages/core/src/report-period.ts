import { shiftDays } from "./common";
import {
	type AbsoluteDateRange,
	lastDayOfMonth,
	type PeriodUnit,
	type ReportDateRange,
	resolveDateRange,
} from "./report";

/** Maps a wire date range to a cadence: presets map to a unit, absolute = custom. */
export function periodUnitOf(range: ReportDateRange): PeriodUnit {
	if (typeof range !== "string") return "custom";
	switch (range) {
		case "today":
		case "yesterday":
			return "day";
		case "this_week":
		case "last_week":
			return "week";
		case "this_month":
		case "last_month":
			return "month";
	}
}

function utcMs(date: string): number {
	const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
	return Date.UTC(y, m - 1, d);
}

function lengthInDays(range: AbsoluteDateRange): number {
	return (utcMs(range.to) - utcMs(range.from)) / 86_400_000 + 1;
}

/** The full calendar month following the month containing `date`. */
function monthAfter(date: string): AbsoluteDateRange {
	const [y = 0, m = 1] = date.split("-").map(Number);
	// monthIndex m (= 0-based m-1, plus one month); Date.UTC normalizes overflow.
	const first = new Date(Date.UTC(y, m, 1));
	return {
		from: first.toISOString().slice(0, 10),
		to: lastDayOfMonth(first.getUTCFullYear(), first.getUTCMonth()),
	};
}

/**
 * Default period for the NEXT report of a given cadence (used by Duplicate).
 *
 * Weekly/monthly anchor on the previous report's resolved range (not on
 * "now"), so duplicating July's report on August 1st still targets August.
 * Daily anchors on now instead: skipped days (weekends) are intentional gaps,
 * not periods to backfill. Custom advances by its own length.
 */
export function deriveNextPeriod(
	unit: PeriodUnit,
	previous: AbsoluteDateRange | null,
	timezone: string,
	now: Date = new Date(),
): AbsoluteDateRange {
	if (unit === "day") return resolveDateRange("today", timezone, now);
	// Without a previous period there is nothing to advance from; fall back to
	// the current period for the cadence.
	if (!previous) {
		if (unit === "week") return resolveDateRange("this_week", timezone, now);
		if (unit === "month") return resolveDateRange("this_month", timezone, now);
		return resolveDateRange("today", timezone, now);
	}
	switch (unit) {
		case "week":
			// Shifts both endpoints, preserving the stored shape even when an
			// override produced a range that is not exactly Monday–Sunday.
			return {
				from: shiftDays(previous.from, 7),
				to: shiftDays(previous.to, 7),
			};
		case "month":
			return monthAfter(previous.to);
		case "custom":
			return {
				from: shiftDays(previous.to, 1),
				to: shiftDays(previous.to, lengthInDays(previous)),
			};
	}
}

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
