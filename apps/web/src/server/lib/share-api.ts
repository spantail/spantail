import type { ReportShareMetaRow } from "@spantail/db";

/**
 * API shape of a share. Internal fields never leave the server: the passcode
 * hash, the frozen rendered body, and the frozen title/period (used only to
 * render the public page) are all stripped. Accepts metadata-only rows (the
 * list query) as well as full rows (create/revoke); the body is stripped either
 * way.
 */
export function toApiShare(
	row: ReportShareMetaRow & { renderedMarkdown?: string },
) {
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
