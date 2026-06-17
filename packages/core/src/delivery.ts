import { z } from "zod";

/** "Send to" input: one or more recipients and an optional short note. */
export const sendReportInputSchema = z.object({
	recipientUserIds: z.array(z.string()).min(1).max(50),
	message: z.string().max(1000).optional(),
});
export type SendReportInput = z.infer<typeof sendReportInputSchema>;

export const sendReportResultSchema = z.object({
	delivered: z.number().int().nonnegative(),
});
export type SendReportResult = z.infer<typeof sendReportResultSchema>;

/** A candidate recipient in the "Send to" picker. */
export const recipientSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});
export type Recipient = z.infer<typeof recipientSchema>;

/** An inbox entry as listed: sender, frozen title/period, read state — no body. */
export const inboxMessageSchema = z.object({
	id: z.string(),
	// Null once the source report has been deleted; the snapshot stands alone.
	reportId: z.string().nullable(),
	senderName: z.string(),
	senderEmail: z.string(),
	reportName: z.string(),
	dateFrom: z.string(),
	dateTo: z.string(),
	message: z.string().nullable(),
	readAt: z.string().nullable(),
	createdAt: z.string(),
});
export type InboxMessage = z.infer<typeof inboxMessageSchema>;

/** A single inbox entry with its frozen rendered body. */
export const inboxMessageDetailSchema = inboxMessageSchema.extend({
	renderedMarkdown: z.string(),
});
export type InboxMessageDetail = z.infer<typeof inboxMessageDetailSchema>;

export const unreadCountSchema = z.object({
	count: z.number().int().nonnegative(),
});
export type UnreadCount = z.infer<typeof unreadCountSchema>;
