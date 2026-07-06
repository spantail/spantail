import { expect, it } from "vitest";

import { parseEntryDate, parseLogWorkArgs } from "./command";

const at = (iso: string) => new Date(iso);

it("resolves today/yesterday in the user's timezone, not UTC", () => {
	// 2026-07-05T20:00Z is already July 6, 05:00 in Tokyo.
	expect(
		parseEntryDate("today", {
			timeZone: "Asia/Tokyo",
			now: at("2026-07-05T20:00:00Z"),
		}),
	).toEqual({ ok: true, date: "2026-07-06" });
	// 2026-07-06T05:00Z is still July 5, 22:00 in Los Angeles.
	expect(
		parseEntryDate("today", {
			timeZone: "America/Los_Angeles",
			now: at("2026-07-06T05:00:00Z"),
		}),
	).toEqual({ ok: true, date: "2026-07-05" });
	expect(
		parseEntryDate("TODAY", {
			timeZone: "UTC",
			now: at("2026-07-06T12:00:00Z"),
		}),
	).toEqual({ ok: true, date: "2026-07-06" });
});

it("resolves Japanese relative words", () => {
	expect(
		parseEntryDate("今日", {
			timeZone: "Asia/Tokyo",
			now: at("2026-07-05T20:00:00Z"),
		}),
	).toEqual({ ok: true, date: "2026-07-06" });
	// Yesterday across a month boundary: Aug 1 in Tokyo → July 31.
	expect(
		parseEntryDate("昨日", {
			timeZone: "Asia/Tokyo",
			now: at("2026-07-31T20:00:00Z"),
		}),
	).toEqual({ ok: true, date: "2026-07-31" });
});

it("resolves yesterday across month and year boundaries", () => {
	expect(
		parseEntryDate("yesterday", {
			timeZone: "UTC",
			now: at("2026-01-01T00:30:00Z"),
		}),
	).toEqual({ ok: true, date: "2025-12-31" });
});

it("accepts canonical ISO dates at or before today", () => {
	const opts = { timeZone: "Asia/Tokyo", now: at("2026-07-05T20:00:00Z") }; // today = 7/6 JST
	expect(parseEntryDate("2026-07-05", opts)).toEqual({
		ok: true,
		date: "2026-07-05",
	});
	expect(parseEntryDate("2026-07-06", opts)).toEqual({
		ok: true,
		date: "2026-07-06",
	});
});

it("rejects future ISO dates in the user's timezone", () => {
	// It is already July 6 in UTC, but still July 5 in Los Angeles → 7/6 is future.
	expect(
		parseEntryDate("2026-07-06", {
			timeZone: "America/Los_Angeles",
			now: at("2026-07-06T05:00:00Z"),
		}),
	).toEqual({ ok: false, error: "future_date" });
});

it("rejects impossible calendar dates", () => {
	const opts = { timeZone: "UTC", now: at("2026-07-06T00:00:00Z") };
	expect(parseEntryDate("2026-02-30", opts)).toEqual({
		ok: false,
		error: "invalid_date",
	});
	expect(parseEntryDate("2026-02-29", opts)).toEqual({
		ok: false,
		error: "invalid_date",
	}); // not a leap year
	expect(parseEntryDate("2026-13-01", opts)).toEqual({
		ok: false,
		error: "invalid_date",
	});
});

it("completes M/D to the most recent year at or before today", () => {
	const jan = { timeZone: "UTC", now: at("2026-01-02T00:00:00Z") };
	expect(parseEntryDate("12/31", jan)).toEqual({
		ok: true,
		date: "2025-12-31",
	});

	const jul = { timeZone: "UTC", now: at("2026-07-06T00:00:00Z") };
	expect(parseEntryDate("7/5", jul)).toEqual({ ok: true, date: "2026-07-05" });
	expect(parseEntryDate("7月5日", jul)).toEqual({
		ok: true,
		date: "2026-07-05",
	});
	// Today's own M/D stays in the current year (at-or-before includes today).
	expect(parseEntryDate("7/6", jul)).toEqual({ ok: true, date: "2026-07-06" });
	// "Tomorrow's" M/D lands in the previous year — never future_date.
	expect(parseEntryDate("7/7", jul)).toEqual({ ok: true, date: "2025-07-07" });
});

it("completes 2/29 by skipping non-leap years", () => {
	expect(
		parseEntryDate("2/29", {
			timeZone: "UTC",
			now: at("2026-03-01T00:00:00Z"),
		}),
	).toEqual({ ok: true, date: "2024-02-29" });
});

it("rejects invalid M/D forms", () => {
	const opts = { timeZone: "UTC", now: at("2026-07-06T00:00:00Z") };
	expect(parseEntryDate("13/1", opts)).toEqual({
		ok: false,
		error: "invalid_date",
	});
	expect(parseEntryDate("2/30", opts)).toEqual({
		ok: false,
		error: "invalid_date",
	});
	expect(parseEntryDate("7-5", opts)).toEqual({
		ok: false,
		error: "invalid_date",
	});
	expect(parseEntryDate("tomorrow", opts)).toEqual({
		ok: false,
		error: "invalid_date",
	});
});

it("is DST-safe on transition days", () => {
	// US spring-forward day 2026-03-08; noon UTC is 07:00 EST → still March 8.
	expect(
		parseEntryDate("today", {
			timeZone: "America/New_York",
			now: at("2026-03-08T12:00:00Z"),
		}),
	).toEqual({ ok: true, date: "2026-03-08" });
});

const argsOpts = { timeZone: "Asia/Tokyo", now: at("2026-07-05T20:00:00Z") }; // today = 7/6 JST

it("parses duration-only args defaulting to today", () => {
	expect(parseLogWorkArgs("2h", argsOpts)).toEqual({
		ok: true,
		durationMinutes: 120,
		entryDate: "2026-07-06",
		dateToken: null,
	});
	expect(parseLogWorkArgs("90", argsOpts)).toMatchObject({
		durationMinutes: 90,
	});
	expect(parseLogWorkArgs("  1h30m  ", argsOpts)).toMatchObject({
		durationMinutes: 90,
	});
});

it("parses two-token durations", () => {
	expect(parseLogWorkArgs("1h 30m", argsOpts)).toMatchObject({
		durationMinutes: 90,
		dateToken: null,
	});
	expect(parseLogWorkArgs("1h 30m yesterday", argsOpts)).toEqual({
		ok: true,
		durationMinutes: 90,
		entryDate: "2026-07-05",
		dateToken: "yesterday",
	});
});

it("parses duration + date combinations", () => {
	expect(parseLogWorkArgs("1h30m yesterday", argsOpts)).toMatchObject({
		entryDate: "2026-07-05",
	});
	expect(parseLogWorkArgs("2h 7/5", argsOpts)).toMatchObject({
		entryDate: "2026-07-05",
	});
	expect(parseLogWorkArgs("90 2026-07-05", argsOpts)).toMatchObject({
		entryDate: "2026-07-05",
	});
	expect(parseLogWorkArgs("2h 今日", argsOpts)).toMatchObject({
		entryDate: "2026-07-06",
	});
});

it("rejects malformed args with specific errors", () => {
	expect(parseLogWorkArgs("", argsOpts)).toEqual({
		ok: false,
		error: "empty_command",
	});
	expect(parseLogWorkArgs("   ", argsOpts)).toEqual({
		ok: false,
		error: "empty_command",
	});
	expect(parseLogWorkArgs("abc", argsOpts)).toEqual({
		ok: false,
		error: "invalid_duration",
	});
	// A second token that is neither part of the duration nor a date lands in
	// the date slot.
	expect(parseLogWorkArgs("2h 45", argsOpts)).toEqual({
		ok: false,
		error: "invalid_date",
	});
	expect(parseLogWorkArgs("2h tomorrow", argsOpts)).toEqual({
		ok: false,
		error: "invalid_date",
	});
	expect(parseLogWorkArgs("2h 2027-01-01", argsOpts)).toEqual({
		ok: false,
		error: "future_date",
	});
	expect(parseLogWorkArgs("2h yesterday extra", argsOpts)).toEqual({
		ok: false,
		error: "trailing_input",
	});
	expect(parseLogWorkArgs("2h yesterday 7/5", argsOpts)).toEqual({
		ok: false,
		error: "trailing_input",
	});
});
