import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../index";
import { reportDeliveries } from "../schema/deliveries";

export type ReportDeliveryRow = typeof reportDeliveries.$inferSelect;
export type ReportDeliveryInsert = Omit<
	typeof reportDeliveries.$inferInsert,
	"id" | "createdAt" | "readAt"
>;

/** Inserts one row per recipient; a single report send fans out to many inboxes. */
export async function createReportDeliveries(
	db: Database,
	values: ReportDeliveryInsert[],
): Promise<void> {
	if (values.length === 0) return;
	await db
		.insert(reportDeliveries)
		.values(values.map((v) => ({ id: crypto.randomUUID(), ...v })));
}

/**
 * A user's inbox, newest first. Metadata only: the (potentially large) frozen
 * body is left out of the list and fetched per-message by getInboxMessage,
 * mirroring the reports list.
 */
export async function listInboxForUser(db: Database, userId: string) {
	return db
		.select({
			id: reportDeliveries.id,
			reportId: reportDeliveries.reportId,
			senderName: reportDeliveries.senderName,
			senderEmail: reportDeliveries.senderEmail,
			reportName: reportDeliveries.reportName,
			dateFrom: reportDeliveries.dateFrom,
			dateTo: reportDeliveries.dateTo,
			message: reportDeliveries.message,
			readAt: reportDeliveries.readAt,
			createdAt: reportDeliveries.createdAt,
		})
		.from(reportDeliveries)
		.where(eq(reportDeliveries.recipientUserId, userId))
		.orderBy(desc(reportDeliveries.createdAt));
}

/** Scoped to the recipient so one user can never read another's inbox. */
export async function getInboxMessage(
	db: Database,
	id: string,
	userId: string,
): Promise<ReportDeliveryRow | undefined> {
	return db
		.select()
		.from(reportDeliveries)
		.where(
			and(
				eq(reportDeliveries.id, id),
				eq(reportDeliveries.recipientUserId, userId),
			),
		)
		.get();
}

/** Idempotent: an already-read message keeps its original readAt. */
export async function markInboxRead(
	db: Database,
	id: string,
	userId: string,
): Promise<void> {
	await db
		.update(reportDeliveries)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(reportDeliveries.id, id),
				eq(reportDeliveries.recipientUserId, userId),
				isNull(reportDeliveries.readAt),
			),
		);
}

export async function markAllInboxRead(
	db: Database,
	userId: string,
): Promise<void> {
	await db
		.update(reportDeliveries)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(reportDeliveries.recipientUserId, userId),
				isNull(reportDeliveries.readAt),
			),
		);
}

/** Returns a read message to the unread state; scoped to the recipient. */
export async function markInboxUnread(
	db: Database,
	id: string,
	userId: string,
): Promise<void> {
	await db
		.update(reportDeliveries)
		.set({ readAt: null })
		.where(
			and(
				eq(reportDeliveries.id, id),
				eq(reportDeliveries.recipientUserId, userId),
			),
		);
}

export async function countUnreadInbox(
	db: Database,
	userId: string,
): Promise<number> {
	const row = await db
		.select({ count: sql<number>`count(*)` })
		.from(reportDeliveries)
		.where(
			and(
				eq(reportDeliveries.recipientUserId, userId),
				isNull(reportDeliveries.readAt),
			),
		)
		.get();
	return row?.count ?? 0;
}
