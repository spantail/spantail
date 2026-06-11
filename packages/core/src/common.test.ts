import { expect, it } from "vitest";

import {
	localDateSchema,
	slugSchema,
	timezoneSchema,
	todayInTimezone,
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

it("computes today in a timezone", () => {
	// 2026-06-11T23:30:00Z is already 2026-06-12 in Tokyo (UTC+9).
	const now = new Date("2026-06-11T23:30:00Z");
	expect(todayInTimezone("Asia/Tokyo", now)).toBe("2026-06-12");
	expect(todayInTimezone("UTC", now)).toBe("2026-06-11");
	// ...and still 2026-06-11 in Honolulu (UTC-10).
	expect(todayInTimezone("Pacific/Honolulu", now)).toBe("2026-06-11");
});
