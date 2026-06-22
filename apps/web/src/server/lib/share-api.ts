import type { ReportShareRow } from "@toxil/db";

/**
 * API shape of a share. Internal fields never leave the server: the passcode
 * hash, the frozen rendered body, and the frozen title/period (used only to
 * render the public page) are all stripped.
 */
export function toApiShare(row: ReportShareRow) {
	const {
		passcodeHash,
		renderedMarkdown: _renderedMarkdown,
		reportName: _reportName,
		dateFrom: _dateFrom,
		dateTo: _dateTo,
		...rest
	} = row;
	return { ...rest, hasPasscode: passcodeHash !== null };
}
