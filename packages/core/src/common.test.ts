import { expect, it } from "vitest";

import {
	FUTURE_SKEW_MS,
	isTimestampInRange,
	localDateSchema,
	MIN_TIMESTAMP,
	shiftDays,
	slugSchema,
	timezoneSchema,
	todayInTimezone,
	utcToZonedTime,
	zonedDateTimeToUtc,
} from "./common";

it("accepts valid slugs", () => {
	for (const slug of ["a", "abc", "a-b-c", "a2", "2a", "my-project-1"]) {
		expect(slugSchema.safeParse(slug).success, slug).toBe(true);
	}
});

it("rejects invalid slugs", () => {
	for (const slug of [
		"",
		"-a",
		"a-",
		"A",
		"a_b",
		"a b",
		"あ",
		"a--b-".repeat(20),
	]) {
		expect(slugSchema.safeParse(slug).success, slug).toBe(false);
	}
});

it("validates IANA timezones", () => {
	expect(timezoneSchema.safeParse("Asia/Tokyo").success).toBe(true);
	expect(timezoneSchema.safeParse("UTC").success).toBe(true);
	expect(timezoneSchema.safeParse("Mars/Olympus").success).toBe(false);
	expect(timezoneSchema.safeParse("").success).toBe(false);
});

it("validates local dates strictly", () => {
	expect(localDateSchema.safeParse("2026-06-11").success).toBe(true);
	expect(localDateSchema.safeParse("2026-02-29").success).toBe(false);
	expect(localDateSchema.safeParse("2024-02-29").success).toBe(true);
	expect(localDateSchema.safeParse("2026-13-01").success).toBe(false);
	expect(localDateSchema.safeParse("2026-6-1").success).toBe(false);
});

it("shifts local dates across month and year boundaries", () => {
	expect(shiftDays("2026-06-13", 1)).toBe("2026-06-14");
	expect(shiftDays("2026-06-13", -13)).toBe("2026-05-31");
	expect(shiftDays("2026-06-30", 1)).toBe("2026-07-01");
	expect(shiftDays("2025-12-31", 1)).toBe("2026-01-01");
	expect(shiftDays("2024-02-28", 1)).toBe("2024-02-29");
	expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28");
});

it("computes today in a timezone", () => {
	// 2026-06-11T23:30:00Z is already 2026-06-12 in Tokyo (UTC+9).
	const now = new Date("2026-06-11T23:30:00Z");
	expect(todayInTimezone("Asia/Tokyo", now)).toBe("2026-06-12");
	expect(todayInTimezone("UTC", now)).toBe("2026-06-11");
	// ...and still 2026-06-11 in Honolulu (UTC-10).
	expect(todayInTimezone("Pacific/Honolulu", now)).toBe("2026-06-11");
});

it("converts a zoned date-time to a UTC instant", () => {
	expect(zonedDateTimeToUtc("2026-06-14", "09:00", "UTC")).toBe(
		"2026-06-14T09:00:00.000Z",
	);
	// Tokyo is UTC+9 year-round.
	expect(zonedDateTimeToUtc("2026-06-14", "09:00", "Asia/Tokyo")).toBe(
		"2026-06-14T00:00:00.000Z",
	);
	// New York: EDT (UTC-4) in summer, EST (UTC-5) in winter.
	expect(zonedDateTimeToUtc("2026-07-01", "09:00", "America/New_York")).toBe(
		"2026-07-01T13:00:00.000Z",
	);
	expect(zonedDateTimeToUtc("2026-01-15", "09:00", "America/New_York")).toBe(
		"2026-01-15T14:00:00.000Z",
	);
});

it("extracts the zoned wall-clock time of a UTC instant", () => {
	expect(utcToZonedTime("2026-06-14T09:00:00.000Z", "UTC")).toBe("09:00");
	expect(utcToZonedTime("2026-06-14T00:00:00.000Z", "Asia/Tokyo")).toBe(
		"09:00",
	);
	expect(utcToZonedTime("2026-07-01T13:00:00.000Z", "America/New_York")).toBe(
		"09:00",
	);
	// Midnight must render as 00:00, not 24:00.
	expect(utcToZonedTime("2026-06-13T15:00:00.000Z", "Asia/Tokyo")).toBe(
		"00:00",
	);
});

it("resolves DST-transition times against the actual instant", () => {
	// 2026-03-08 is US spring-forward; 03:30 is already EDT (UTC-4) → 07:30Z,
	// not the EST (UTC-5) offset sampled at the naive guess.
	expect(zonedDateTimeToUtc("2026-03-08", "03:30", "America/New_York")).toBe(
		"2026-03-08T07:30:00.000Z",
	);
	expect(utcToZonedTime("2026-03-08T07:30:00.000Z", "America/New_York")).toBe(
		"03:30",
	);
});

it("normalizes a non-existent spring-forward gap time forward", () => {
	// 02:30 does not exist on 2026-03-08 in New York (02:00→03:00). Normalize to
	// 03:30 EDT (07:30Z) rather than rolling back to 01:30.
	expect(zonedDateTimeToUtc("2026-03-08", "02:30", "America/New_York")).toBe(
		"2026-03-08T07:30:00.000Z",
	);
	expect(utcToZonedTime("2026-03-08T07:30:00.000Z", "America/New_York")).toBe(
		"03:30",
	);
	// Same gap in a zone whose transition precedes the naive UTC guess: Berlin
	// jumps 02:00→03:00 at 01:00Z, so 02:30 normalizes forward to 03:30 (01:30Z).
	expect(zonedDateTimeToUtc("2026-03-29", "02:30", "Europe/Berlin")).toBe(
		"2026-03-29T01:30:00.000Z",
	);
	expect(utcToZonedTime("2026-03-29T01:30:00.000Z", "Europe/Berlin")).toBe(
		"03:30",
	);
});

it("round-trips zoned time through UTC", () => {
	for (const tz of ["UTC", "Asia/Tokyo", "America/New_York"]) {
		for (const time of ["00:00", "09:30", "23:45"]) {
			expect(
				utcToZonedTime(zonedDateTimeToUtc("2026-06-14", time, tz), tz),
			).toBe(time);
		}
	}
});

it("bounds timestamps to the plausible ingest window", () => {
	const now = new Date("2026-06-14T12:00:00.000Z");
	// In range: the lower bound itself, a recent instant, and "now".
	expect(isTimestampInRange(MIN_TIMESTAMP, now)).toBe(true);
	expect(isTimestampInRange("2026-06-14T11:59:00.000Z", now)).toBe(true);
	expect(isTimestampInRange(now.toISOString(), now)).toBe(true);
	// Clock-skew margin: just inside vs. just past the future allowance.
	expect(
		isTimestampInRange(
			new Date(now.getTime() + FUTURE_SKEW_MS).toISOString(),
			now,
		),
	).toBe(true);
	expect(
		isTimestampInRange(
			new Date(now.getTime() + FUTURE_SKEW_MS + 1000).toISOString(),
			now,
		),
	).toBe(false);
	// Out of range: backdated below the floor, and unparseable input.
	expect(isTimestampInRange("1970-01-01T00:00:00.000Z", now)).toBe(false);
	expect(isTimestampInRange("2019-12-31T23:59:59.000Z", now)).toBe(false);
	expect(isTimestampInRange("not-a-date", now)).toBe(false);
});
