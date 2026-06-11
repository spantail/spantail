/** Formats integer minutes as `2h 05m` / `45m` / `3h`. */
export function formatDuration(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${String(m).padStart(2, "0")}m`;
}
