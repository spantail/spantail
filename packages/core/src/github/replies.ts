import { formatDuration, formatHours } from "../duration";
import type { LogWorkParseError } from "./command";

/**
 * Reply/error message templates shared by the GitHub comment replies (UC1)
 * and the log-work API error messages (UC2). English-only in v1: GitHub
 * comment threads are shared, mixed-language surfaces and the i18n catalogs
 * are a client-bundle concern. Templates never echo attacker-controlled
 * input beyond the bounded, already-validated pieces they interpolate.
 */

export function logWorkSuccessReply(p: {
	durationMinutes: number;
	entryDate: string;
	totalMinutes: number;
}): string {
	return `✅ Logged ${formatDuration(p.durationMinutes)} on ${p.entryDate} (total on this issue: ${formatHours(p.totalMinutes)})`;
}

const PARSE_ERROR_REPLIES: Record<LogWorkParseError, string> = {
	empty_command:
		"Usage: `@spantail <duration> [date]` — e.g. `@spantail 2h`, `@spantail 30m yesterday`, `@spantail 1h30m 2026-07-05`.",
	invalid_duration:
		"Could not read a duration. Use forms like `30m`, `2h`, `1h30m`, or plain minutes (`90`).",
	invalid_date:
		"Could not read the date. Use `YYYY-MM-DD` (e.g. `2026-07-05`), `M/D`, `today`, or `yesterday`.",
	future_date:
		"That date is in the future. Spantail only logs work for today or earlier.",
	trailing_input:
		"Only `<duration> [date]` is supported for now — remove the extra text after the date.",
};

export function logWorkErrorReply(error: LogWorkParseError): string {
	return PARSE_ERROR_REPLIES[error];
}

export function unmappedRepoReply(
	fullName: string,
	settingsUrl: string,
): string {
	return `This repository (\`${fullName}\`) is not mapped to a Spantail project yet. A workspace admin can add the mapping at ${settingsUrl}.`;
}

export function notAMemberReply(): string {
	return "Your Spantail account is not a member of the workspace this repository is mapped to, so nothing was logged.";
}

export function onboardingReply(connectUrl: string): string {
	return `To log work from GitHub, connect your GitHub account to Spantail first: ${connectUrl}. Then re-post your command.`;
}
