import { shiftDays, todayInTimezone } from "../common";
import { parseDuration } from "../duration";

/**
 * The `@spantail <duration> [date]` / `/spantail:log-work #N <duration> [date]`
 * grammar. Parsing is deterministic — no inference on free text — and lives
 * here so the GitHub webhook, the API route, and the MCP tool all interpret
 * the exact same raw string (clients never parse; see issue #159).
 */

export type EntryDateError = "invalid_date" | "future_date";

export type ParsedEntryDate =
	| { ok: true; date: string }
	| { ok: false; error: EntryDateError };

/** How many years back M/D completion searches (covers Feb 29 across leaps). */
const MAX_YEAR_LOOKBACK = 8;

function isRealCalendarDate(y: number, m: number, d: number): boolean {
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toIsoDate(y: number, m: number, d: number): string {
	return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Parses one date token in the user's timezone. Accepted forms (v1):
 * `today`/`yesterday` (case-insensitive), `今日`/`昨日`, ISO `YYYY-MM-DD`
 * (the canonical form), and month/day `7/5` / `7月5日` (M/D fixed; the year
 * completes to the most recent year that puts the date at or before today).
 * Future dates are an error — work can only be logged for today or earlier.
 */
export function parseEntryDate(
	token: string,
	opts: { timeZone: string; now?: Date },
): ParsedEntryDate {
	const today = todayInTimezone(opts.timeZone, opts.now);
	const lower = token.toLowerCase();
	if (lower === "today" || token === "今日") return { ok: true, date: today };
	if (lower === "yesterday" || token === "昨日") {
		return { ok: true, date: shiftDays(today, -1) };
	}

	const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
	if (iso) {
		const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
		if (!isRealCalendarDate(y, m, d))
			return { ok: false, error: "invalid_date" };
		const date = toIsoDate(y, m, d);
		if (date > today) return { ok: false, error: "future_date" };
		return { ok: true, date };
	}

	const monthDay =
		/^(\d{1,2})\/(\d{1,2})$/.exec(token) ??
		/^(\d{1,2})月(\d{1,2})日$/.exec(token);
	if (monthDay) {
		const [m, d] = [Number(monthDay[1]), Number(monthDay[2])];
		const todayYear = Number(today.slice(0, 4));
		// Most recent year that makes this M/D a real date at or before today.
		for (let y = todayYear; y >= todayYear - MAX_YEAR_LOOKBACK; y--) {
			if (!isRealCalendarDate(y, m, d)) continue;
			const date = toIsoDate(y, m, d);
			if (date <= today) return { ok: true, date };
		}
		return { ok: false, error: "invalid_date" };
	}

	return { ok: false, error: "invalid_date" };
}

export type LogWorkParseError =
	| "empty_command"
	| "invalid_duration"
	| EntryDateError
	| "trailing_input";

export type ParsedLogWorkArgs =
	| {
			ok: true;
			durationMinutes: number;
			entryDate: string;
			/** The raw date token that matched, null when the date was omitted. */
			dateToken: string | null;
	  }
	| { ok: false; error: LogWorkParseError };

/**
 * Parses the raw `<duration> [date]` argument string. The duration may span
 * two tokens (`1h 30m`) — the longest prefix `parseDuration` accepts wins.
 * A date omission means "today at the reference instant" in the user's
 * timezone. Any input after the date token is reserved for future grammar
 * (e.g. a trailing description) and rejected as `trailing_input` for now.
 */
export function parseLogWorkArgs(
	raw: string,
	opts: { timeZone: string; now?: Date },
): ParsedLogWorkArgs {
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return { ok: false, error: "empty_command" };

	let durationMinutes: number | null = null;
	let consumed = 0;
	if (tokens.length >= 2) {
		durationMinutes = parseDuration(`${tokens[0]} ${tokens[1]}`);
		if (durationMinutes !== null) consumed = 2;
	}
	if (durationMinutes === null) {
		durationMinutes = parseDuration(tokens[0] ?? "");
		if (durationMinutes !== null) consumed = 1;
	}
	if (durationMinutes === null) return { ok: false, error: "invalid_duration" };

	const rest = tokens.slice(consumed);
	if (rest.length === 0) {
		return {
			ok: true,
			durationMinutes,
			entryDate: todayInTimezone(opts.timeZone, opts.now),
			dateToken: null,
		};
	}

	const dateToken = rest[0] ?? "";
	const parsed = parseEntryDate(dateToken, opts);
	if (!parsed.ok) return { ok: false, error: parsed.error };
	if (rest.length > 1) return { ok: false, error: "trailing_input" };

	return { ok: true, durationMinutes, entryDate: parsed.date, dateToken };
}
