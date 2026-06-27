import { z } from "zod";

/** Lowercase URL-safe identifier: `my-project`, `acme2`. */
export const slugSchema = z
	.string()
	.min(1)
	.max(50)
	.regex(
		/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
		"must contain only lowercase letters, digits, and inner hyphens",
	);

function isValidTimezone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone });
		return true;
	} catch {
		return false;
	}
}

/** IANA timezone name, e.g. `Asia/Tokyo`. */
export const timezoneSchema = z
	.string()
	.min(1)
	.max(64)
	.refine(isValidTimezone, "must be a valid IANA timezone");

/** Local date in `YYYY-MM-DD` form (no timezone). */
export const localDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date")
	.refine((value) => {
		const [y, m, d] = value.split("-").map(Number);
		if (!y || !m || !d) return false;
		const date = new Date(Date.UTC(y, m - 1, d));
		return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
	}, "must be a real calendar date");

/** Shifts a `YYYY-MM-DD` date by whole days using UTC calendar math. */
export function shiftDays(date: string, days: number): string {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days))
		.toISOString()
		.slice(0, 10);
}

/**
 * Returns today's local date (`YYYY-MM-DD`) in the given IANA timezone.
 * en-CA formats as YYYY-MM-DD.
 */
export function todayInTimezone(
	timeZone: string,
	now: Date = new Date(),
): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

/**
 * Offset of an IANA timezone at a given instant, in minutes
 * (local wall-clock − UTC). `Asia/Tokyo` → 540; New York in summer → −240.
 */
function timeZoneOffsetMinutes(timeZone: string, instant: Date): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(instant);
	const get = (type: string) =>
		Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour") % 24, // some engines emit 24 for midnight
		get("minute"),
		get("second"),
	);
	return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Combines a local date (`YYYY-MM-DD`) and wall-clock time (`HH:MM`)
 * interpreted in the given IANA timezone into a UTC ISO-8601 timestamp.
 */
export function zonedDateTimeToUtc(
	date: string,
	time: string,
	timeZone: string,
): string {
	const [y, mo, d] = date.split("-").map(Number);
	const [h, mi] = time.split(":").map(Number);
	const guess = Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
	// Sample the offset at the naive guess, then at the resulting instant, giving
	// two candidate instants that bracket any nearby DST transition.
	const offset1 = timeZoneOffsetMinutes(timeZone, new Date(guess));
	const utc1 = guess - offset1 * 60000;
	const offset2 = timeZoneOffsetMinutes(timeZone, new Date(utc1));
	const utc2 = guess - offset2 * 60000;
	const want = `${String(h ?? 0).padStart(2, "0")}:${String(mi ?? 0).padStart(2, "0")}`;
	// Prefer the candidate whose wall clock matches the request; this resolves
	// normal times and transitions in either direction.
	if (utcToZonedTime(new Date(utc2).toISOString(), timeZone) === want) {
		return new Date(utc2).toISOString();
	}
	if (utcToZonedTime(new Date(utc1).toISOString(), timeZone) === want) {
		return new Date(utc1).toISOString();
	}
	// A non-existent spring-forward gap time matches neither candidate; normalize
	// forward to the first real instant (the later candidate), in any zone.
	return new Date(Math.max(utc1, utc2)).toISOString();
}

/** Wall-clock time (`HH:MM`) of a UTC timestamp in the given IANA timezone. */
export function utcToZonedTime(instant: string, timeZone: string): string {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(new Date(instant));
	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? "00";
	const hour = String(Number(get("hour")) % 24).padStart(2, "0");
	return `${hour}:${get("minute")}`;
}

/**
 * Lower bound for ingested timestamps. Spantail did not exist before this, so
 * anything earlier is a backdated/garbage value, not real activity.
 */
export const MIN_TIMESTAMP = "2020-01-01T00:00:00.000Z";

/**
 * How far into the future an ingested timestamp may sit. Real sessions can only
 * end "now"; this margin just absorbs client/server clock skew (10 minutes).
 */
export const FUTURE_SKEW_MS = 10 * 60 * 1000;

/**
 * Whether an ISO-8601 timestamp falls within the plausible ingest window:
 * not before {@link MIN_TIMESTAMP} and not more than {@link FUTURE_SKEW_MS}
 * past `now`. Unparseable input is out of range. ISO *format* is assumed to
 * have been checked already (e.g. by `z.iso.datetime()`); this is the *range*
 * check the format check does not perform.
 */
export function isTimestampInRange(
	iso: string,
	now: Date = new Date(),
): boolean {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return false;
	return t >= Date.parse(MIN_TIMESTAMP) && t <= now.getTime() + FUTURE_SKEW_MS;
}
