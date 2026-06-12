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
