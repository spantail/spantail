/**
 * Locale-aware human display formatting for dates, date ranges, and timestamps.
 * Runtime-agnostic (pure ECMA-402 `Intl`) so the SPA, the report engine, and the
 * CLI share one policy. Duration formatting lives in ./duration (deliberately
 * locale-independent); clock and relative-time helpers stay in the web client.
 *
 * Policy:
 * - A work date (a local `YYYY-MM-DD`) renders with a weekday; timestamps and
 *   ranges do not (weekday there is noise).
 * - The year is controlled by `YearMode`: `"auto"` omits it when the date is in
 *   the same calendar year as `now` (the viewer's today, `YYYY-MM-DD`) and shows
 *   it otherwise; `"always"`/`"never"` force it. With no `now`, `"auto"` omits
 *   the year.
 * - Clock times are 24-hour in both locales.
 */

export type YearMode = "auto" | "always" | "never";

function yearOf(isoDate: string): number {
	return Number(isoDate.slice(0, 4));
}

/** Whether to include the year, given the mode and the two calendar years. */
function includeYear(
	mode: YearMode,
	dateYear: number,
	nowYear: number,
): boolean {
	if (mode === "always") return true;
	if (mode === "never") return false;
	return Number.isFinite(nowYear) ? dateYear !== nowYear : false;
}

// `new Date("YYYY-MM-DD")` parses as UTC midnight and shifts a day in behind-UTC
// locales; build from parts so the stored calendar day is preserved.
function dateFromParts(isoDate: string): Date {
	const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export interface DayStyle {
	/** The viewer's today (`YYYY-MM-DD`); the reference for `year: "auto"`. */
	now?: string;
	/** Default `"auto"`. */
	year?: YearMode;
	/** Default `"short"`. `"none"` drops the weekday. */
	weekday?: "short" | "long" | "none";
	/** Default `"short"`. */
	month?: "short" | "long";
}

/**
 * A local work date (`YYYY-MM-DD`) with a weekday: `Mon, Jun 1` / `6月1日(月)`
 * (year per `style.year`, e.g. `Mon, Jun 1, 2024` / `2024年6月1日(月)`).
 */
export function formatDay(
	date: string,
	locale: string,
	style: DayStyle = {},
): string {
	const { now, year = "auto", weekday = "short", month = "short" } = style;
	const options: Intl.DateTimeFormatOptions = { month, day: "numeric" };
	if (weekday !== "none") options.weekday = weekday;
	if (includeYear(year, yearOf(date), now ? yearOf(now) : Number.NaN))
		options.year = "numeric";
	return new Intl.DateTimeFormat(locale, options).format(dateFromParts(date));
}

export interface RangeStyle {
	now?: string;
	year?: YearMode;
}

/**
 * An inclusive `YYYY-MM-DD` range, no weekday: `Jun 1 – 30`, `May 28 – Jun 13`,
 * or a single `Jun 1`; ja `6月1日 – 30日`. Same-month ranges drop the repeated
 * month on the end. When the year is shown (per `style.year`; `"auto"` shows it
 * when an endpoint is outside `now`'s year) both endpoints are fully qualified.
 */
export function formatDateRange(
	from: string,
	to: string,
	locale: string,
	style: RangeStyle = {},
): string {
	const { now, year = "auto" } = style;
	const nowYear = now ? yearOf(now) : Number.NaN;
	const withYear =
		includeYear(year, yearOf(from), nowYear) ||
		includeYear(year, yearOf(to), nowYear);
	const base: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
	const a = dateFromParts(from);
	if (from === to)
		return new Intl.DateTimeFormat(locale, {
			...base,
			...(withYear ? { year: "numeric" } : {}),
		}).format(a);
	const b = dateFromParts(to);
	if (withYear) {
		const full = new Intl.DateTimeFormat(locale, { ...base, year: "numeric" });
		return `${full.format(a)} – ${full.format(b)}`;
	}
	const monthDay = new Intl.DateTimeFormat(locale, base);
	const sameMonth = from.slice(0, 7) === to.slice(0, 7);
	const end = sameMonth
		? new Intl.DateTimeFormat(locale, { day: "numeric" }).format(b)
		: monthDay.format(b);
	return `${monthDay.format(a)} – ${end}`;
}

export interface TimestampStyle {
	now?: string;
	year?: YearMode;
}

/**
 * The calendar date of an absolute instant in `timeZone`, no weekday and no
 * clock: `Jun 1` / `6月1日` (year per `style.year`, default `"auto"`). For
 * created/expiry metadata where the time of day is noise; use `formatTimestamp`
 * when the clock matters.
 */
export function formatInstantDate(
	iso: string,
	locale: string,
	timeZone: string,
	style: TimestampStyle = {},
): string {
	const { now, year = "auto" } = style;
	const date = new Date(iso);
	const options: Intl.DateTimeFormatOptions = {
		month: "short",
		day: "numeric",
		timeZone,
	};
	const dateYear = Number(
		new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone }).format(
			date,
		),
	);
	if (includeYear(year, dateYear, now ? yearOf(now) : Number.NaN))
		options.year = "numeric";
	return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * An absolute instant as date + 24-hour clock in `timeZone`, no weekday:
 * `Jun 1, 09:05` / `6月1日 09:05` (year per `style.year`, default `"auto"`
 * compared against `now` in `timeZone`).
 */
export function formatTimestamp(
	iso: string,
	locale: string,
	timeZone: string,
	style: TimestampStyle = {},
): string {
	const { now, year = "auto" } = style;
	const date = new Date(iso);
	const options: Intl.DateTimeFormatOptions = {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZone,
	};
	const dateYear = Number(
		new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone }).format(
			date,
		),
	);
	if (includeYear(year, dateYear, now ? yearOf(now) : Number.NaN))
		options.year = "numeric";
	return new Intl.DateTimeFormat(locale, options).format(date);
}
