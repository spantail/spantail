import type { ReportDeliveryRow } from "@toxil/db";

/**
 * API shape of an inbox entry. The recipient id and the internal sender id are
 * dropped (callers only ever see their own inbox); the rendered body is stripped
 * for list payloads and kept by the detail variant.
 */
export function toApiInbox(row: ReportDeliveryRow) {
	const {
		renderedMarkdown: _renderedMarkdown,
		recipientUserId: _recipientUserId,
		senderUserId: _senderUserId,
		...rest
	} = row;
	return rest;
}

export function toApiInboxDetail(row: ReportDeliveryRow) {
	const {
		recipientUserId: _recipientUserId,
		senderUserId: _senderUserId,
		...rest
	} = row;
	return rest;
}
