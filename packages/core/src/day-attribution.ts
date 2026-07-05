import { shiftDays, todayInTimezone, zonedDateTimeToUtc } from "./common";

/** A timed span whose duration is attributed to local calendar days. */
export interface AttributableSpan {
	/** UTC ISO-8601 instant the span started. */
	startedAt: string;
	/** UTC ISO-8601 instant the span ended; null when unknown/open. */
	endedAt: string | null;
	/** Active minutes — may be less than the wall-clock elapsed time. */
	durationMinutes: number;
}

// Hard stop for the per-span day iteration. Ingest bounds timestamps to a
// plausible window, so a span never legitimately covers this many days.
const MAX_DAYS_PER_SPAN = 400;

/**
 * The local calendar day (`YYYY-MM-DD` in `timeZone`) that carries the most
 * duration across the spans. Each span's `durationMinutes` is active time, not
 * elapsed time, so it is attributed to days proportionally to the span's
 * wall-clock overlap with each day; day lengths around DST transitions are the
 * real 23/25 hours. Ties resolve to the most recent day. A span with no
 * `endedAt` (or an end not after its start, or an unparseable timestamp)
 * attributes its whole duration to `startedAt`'s day. Returns null for an
 * empty input.
 */
export function dominantEntryDate(
	spans: AttributableSpan[],
	timeZone: string,
): string | null {
	const weights = new Map<string, number>();
	const add = (day: string, minutes: number) =>
		weights.set(day, (weights.get(day) ?? 0) + minutes);

	for (const span of spans) {
		const start = Date.parse(span.startedAt);
		if (Number.isNaN(start)) continue;
		const startDay = todayInTimezone(timeZone, new Date(start));
		// Seed the start day so zero-duration spans still nominate a candidate.
		add(startDay, 0);

		const end = span.endedAt === null ? Number.NaN : Date.parse(span.endedAt);
		if (!Number.isFinite(end) || end <= start) {
			add(startDay, span.durationMinutes);
			continue;
		}

		let cursor = start;
		for (let i = 0; cursor < end && i < MAX_DAYS_PER_SPAN; i++) {
			const day = todayInTimezone(timeZone, new Date(cursor));
			const boundary = Date.parse(
				zonedDateTimeToUtc(shiftDays(day, 1), "00:00", timeZone),
			);
			if (boundary <= cursor) {
				// Never expected (zonedDateTimeToUtc normalizes a skipped midnight
				// forward, still past cursor); bail rather than loop forever.
				add(day, (span.durationMinutes * (end - cursor)) / (end - start));
				break;
			}
			const segmentEnd = Math.min(boundary, end);
			add(day, (span.durationMinutes * (segmentEnd - cursor)) / (end - start));
			cursor = segmentEnd;
		}
	}

	let best: string | null = null;
	for (const [day, weight] of weights) {
		if (
			best === null ||
			weight > (weights.get(best) ?? 0) ||
			// Exact-equality tie (symmetric splits produce exact halves in binary
			// floats): prefer the most recent day, which is the lexicographically
			// greater YYYY-MM-DD string.
			(weight === weights.get(best) && day > best)
		) {
			best = day;
		}
	}
	return best;
}
