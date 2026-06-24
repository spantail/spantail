import { shiftDays } from "@spantail/core";

export interface DateBucket {
	date: string;
	minutes: number;
	count: number;
}

/** One zero-filled day in a daily-bar window. */
export interface DailyBar {
	date: string;
	minutes: number;
	count: number;
	isWeekend: boolean;
}

/** True for Saturday/Sunday of the given `YYYY-MM-DD` calendar date. */
export function isWeekend(date: string): boolean {
	const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
	const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return dow === 0 || dow === 6;
}

/** Inclusive day count between two `YYYY-MM-DD` dates (>= 1 when from <= to). */
export function daysInclusive(from: string, to: string): number {
	const [fy = 0, fm = 1, fd = 1] = from.split("-").map(Number);
	const [ty = 0, tm = 1, td = 1] = to.split("-").map(Number);
	const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
	return Math.floor(ms / 86_400_000) + 1;
}

/**
 * Sum minutes/count over the inclusive `[from, to]` date window. Date strings
 * sort lexicographically the same as chronologically, so plain comparison works.
 */
export function sumWindow(
	rows: readonly DateBucket[],
	from: string,
	to: string,
): { minutes: number; count: number } {
	return rows.reduce(
		(acc, row) =>
			row.date >= from && row.date <= to
				? {
						minutes: acc.minutes + row.minutes,
						count: acc.count + row.count,
					}
				: acc,
		{ minutes: 0, count: 0 },
	);
}

/**
 * Period-over-period percentage change, rounded. Returns `null` when there is
 * no comparable base (previous period had no activity), so callers can hide a
 * meaningless "+100%" rather than fabricate one.
 */
export function pctDelta(current: number, previous: number): number | null {
	if (previous <= 0) return null;
	return Math.round(((current - previous) / previous) * 100);
}

/**
 * Builds a contiguous, zero-filled day series of `length` days starting at
 * `from`. The stats endpoint only returns days that have entries, so callers
 * zero-fill the gaps for charting.
 */
export function buildDailyWindow(
	byDate: Map<string, DateBucket>,
	from: string,
	length: number,
): DailyBar[] {
	return Array.from({ length }, (_, i) => {
		const date = shiftDays(from, i);
		const row = byDate.get(date);
		return {
			date,
			minutes: row?.minutes ?? 0,
			count: row?.count ?? 0,
			isWeekend: isWeekend(date),
		};
	});
}
