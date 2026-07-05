import { z } from "zod";

/**
 * "Send to" input: recipients and/or a copy to the sender's own inbox, plus an
 * optional short note. `sendToSelf` is a flag rather than the sender appearing
 * in `recipientUserIds` (they are excluded from the picker); at least one of a
 * recipient or `sendToSelf` must be present.
 */
export const sendReportInputSchema = z
	.object({
		recipientUserIds: z.array(z.string()).max(50).default([]),
		sendToSelf: z.boolean().default(false),
		message: z.string().max(1000).optional(),
	})
	.refine((v) => v.recipientUserIds.length > 0 || v.sendToSelf, {
		message: "Select at least one recipient or send to yourself",
	});
export type SendReportInput = z.infer<typeof sendReportInputSchema>;

export const sendReportResultSchema = z.object({
	delivered: z.number().int().nonnegative(),
});
export type SendReportResult = z.infer<typeof sendReportResultSchema>;

/**
 * One entry in a report's send history (owner view): a single "Send to" batch,
 * fanned out to one or more recipients. `id` is the batch id; `readCount` is how
 * many recipients have opened their copy. Self-copies are excluded.
 */
export const reportSendSchema = z.object({
	id: z.string(),
	createdAt: z.string(),
	message: z.string().nullable(),
	recipientNames: z.array(z.string()),
	recipientCount: z.number().int().nonnegative(),
	readCount: z.number().int().nonnegative(),
});
export type ReportSend = z.infer<typeof reportSendSchema>;

/** A candidate recipient in the "Send to" picker. */
export const recipientSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	// Ready-to-use avatar URL, or null when the user has no avatar.
	imageUrl: z.string().nullable(),
});
export type Recipient = z.infer<typeof recipientSchema>;

/** The mailbox folders, each a server-side filter over the caller's deliveries. */
export const mailFolderSchema = z.enum([
	"inbox",
	"starred",
	"sent",
	"archive",
	"trash",
]);
export type MailFolder = z.infer<typeof mailFolderSchema>;

/**
 * Query for a mailbox folder listing. limit is optional: omitted returns the
 * full folder (prev/next navigation needs it); the list view passes limit/offset
 * to scroll.
 */
export const listInboxQuerySchema = z.object({
	folder: mailFolderSchema.default("inbox"),
	limit: z.coerce.number().int().min(1).max(200).optional(),
	offset: z.coerce.number().int().min(0).optional(),
});
export type ListInboxQuery = z.infer<typeof listInboxQuerySchema>;
// z.coerce fields have an `unknown` input type; clients send numbers.
export type ListInboxQueryData = {
	folder?: MailFolder;
	limit?: number;
	offset?: number;
};

/**
 * Which side of a delivery the caller is looking at: a received copy (per-row)
 * or a sent batch (grouped). Determines the flag target — received flags key on
 * the delivery id, sent flags on the batch id.
 */
export const mailScopeSchema = z.enum(["received", "sent"]);
export type MailScope = z.infer<typeof mailScopeSchema>;

/**
 * A mailbox entry as listed (no body). Serves both received messages and sent
 * batches; per-scope fields are simply empty for the other scope (received:
 * recipientNames []/recipientCount 0; sent: readAt null). The client routes and
 * flags by `scope` — received uses `id`, sent uses `batchId`.
 */
export const mailItemSchema = z.object({
	// Delivery id (for sent, a representative row in the batch).
	id: z.string(),
	scope: mailScopeSchema,
	batchId: z.string(),
	// The content version this delivery carried — the key for content-scoped
	// resources (the version's discussion thread). A delivery cascades away
	// with its version, so it can never outlive it.
	reportContentId: z.string(),
	senderName: z.string(),
	senderEmail: z.string(),
	// Received scope: the sender's ready-to-use avatar URL, or null when the
	// sender has no avatar (or the account was deleted). Sent scope: null.
	senderImageUrl: z.string().nullable(),
	reportName: z.string(),
	dateFrom: z.string(),
	dateTo: z.string(),
	message: z.string().nullable(),
	// Received: read state. Sent: always null (no read concept).
	readAt: z.string().nullable(),
	createdAt: z.string(),
	starred: z.boolean(),
	archived: z.boolean(),
	trashed: z.boolean(),
	// Sent only: aggregated recipients for the "To: …" summary.
	recipientNames: z.array(z.string()),
	// Sent only: each recipient's avatar URL, aligned by index with
	// recipientNames (null where a recipient has no avatar). Empty for received.
	recipientImageUrls: z.array(z.string().nullable()),
	recipientCount: z.number().int().nonnegative(),
});
export type MailItem = z.infer<typeof mailItemSchema>;

/** A received message opened: the frozen rendered body. */
export const receivedDetailSchema = mailItemSchema.extend({
	scope: z.literal("received"),
	renderedMarkdown: z.string(),
});
export type ReceivedDetail = z.infer<typeof receivedDetailSchema>;

/** A sent batch opened: the frozen body plus the full recipient list. */
export const sentDetailSchema = mailItemSchema.extend({
	scope: z.literal("sent"),
	renderedMarkdown: z.string(),
	recipients: z.array(recipientSchema),
});
export type SentDetail = z.infer<typeof sentDetailSchema>;

/** A mailbox item opened. The caller's relationship to the delivery picks the
 * variant: recipient → received, sender → sent batch. */
export const mailItemDetailSchema = z.discriminatedUnion("scope", [
	receivedDetailSchema,
	sentDetailSchema,
]);
export type MailItemDetail = z.infer<typeof mailItemDetailSchema>;

/** Per-folder counts for the mailbox sidebar; `unread` is the Inbox badge. */
export const mailFolderCountsSchema = z.object({
	inbox: z.number().int().nonnegative(),
	unread: z.number().int().nonnegative(),
	starred: z.number().int().nonnegative(),
	sent: z.number().int().nonnegative(),
	archive: z.number().int().nonnegative(),
	trash: z.number().int().nonnegative(),
});
export type MailFolderCounts = z.infer<typeof mailFolderCountsSchema>;

/** Toggle one or more flags on a mailbox target (a delivery or a sent batch). */
export const setMailFlagsInputSchema = z
	.object({
		scope: mailScopeSchema,
		targetId: z.string(),
		starred: z.boolean().optional(),
		archived: z.boolean().optional(),
		trashed: z.boolean().optional(),
	})
	.refine(
		(v) =>
			v.starred !== undefined ||
			v.archived !== undefined ||
			v.trashed !== undefined,
		{ message: "At least one flag must be provided" },
	);
export type SetMailFlagsInput = z.infer<typeof setMailFlagsInputSchema>;

export const unreadCountSchema = z.object({
	count: z.number().int().nonnegative(),
});
export type UnreadCount = z.infer<typeof unreadCountSchema>;
