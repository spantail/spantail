import { bodyLimit } from "hono/body-limit";

/**
 * Upper bound for a buffered ingest body.
 *
 * Sized to admit the largest *realistic* payload each ingest route accepts, not
 * the largest its schema could theoretically express. A full `/work-entries/batch`
 * (100 entries, each with a 10k-char note in a 3-bytes-per-char script) lands
 * around 4 MB; a 5000-event agent-events post lands around 3 MB. A payload that
 * fills every per-field cap of all 5000 events would be tens of MB — that one
 * gets a 413, which is the point: the per-field caps bound each value, this
 * bounds what a single request can write in total.
 */
const MAX_INGEST_BYTES = 8 * 1024 * 1024;

/**
 * Reject an oversized ingest body before it is buffered or parsed. Ingestion is
 * the untrusted write path (docs/security.md §1): a leaked agent token must not
 * be able to inflate the operator's storage one huge request at a time.
 *
 * 413 carries the `bad_request` code because `ErrorCode` has no 413 member; the
 * GitHub webhook's own size check answers the same way.
 */
export const ingestBodyLimit = bodyLimit({
	maxSize: MAX_INGEST_BYTES,
	onError: (c) =>
		c.json(
			{ error: { code: "bad_request", message: "Payload too large" } },
			413,
		),
});
