import { todayInTimezone } from "@spantail/core";

import { useUserTimezone } from "./use-user-timezone";

/**
 * The viewer's today as a local `YYYY-MM-DD` in their timezone. The reference
 * for `year: "auto"` in the shared date formatters: pass it as `now` so a date
 * in the current year renders without a year and older dates keep theirs.
 */
export function useToday(): string {
	return todayInTimezone(useUserTimezone());
}
