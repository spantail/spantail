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
	// Offset at the guessed instant; correct outside the DST transition hour.
	const offset = timeZoneOffsetMinutes(timeZone, new Date(guess));
	return new Date(guess - offset * 60000).toISOString();
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
