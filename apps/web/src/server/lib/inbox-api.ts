import type { ReportDeliveryRow } from "@toxil/db";

/**
 * API shape of a single inbox entry (detail): the recipient id and the internal
 * sender id are dropped (callers only ever see their own inbox); the frozen body
 * is kept. List payloads come straight from listInboxForUser (metadata only).
 */
export function toApiInboxDetail(row: ReportDeliveryRow) {
	const {
		recipientUserId: _recipientUserId,
		senderUserId: _senderUserId,
		...rest
	} = row;
	return rest;
}
