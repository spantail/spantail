import type { MailFolder, MailScope } from "@toxil/core";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "../index";
import { user } from "../schema/auth";
import { reportDeliveries } from "../schema/deliveries";
import { deliveryFlags } from "../schema/delivery-flags";

export type ReportDeliveryRow = typeof reportDeliveries.$inferSelect;
export type ReportDeliveryInsert = Omit<
	typeof reportDeliveries.$inferInsert,
	"id" | "createdAt" | "readAt"
>;

// Names in a Sent "To: …" summary are joined with the ASCII unit separator so a
// comma (or any printable char) inside a name never splits a recipient.
const NAME_SEP = "";

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
 * The flag predicate for a folder, evaluated against the left-joined
 * delivery_flags columns (null = not flagged). Trash is terminal: it shows
 * trashed items regardless of star/archive; every other folder excludes trash.
 */
function flagPredicate(folder: MailFolder) {
	switch (folder) {
		case "inbox":
		case "sent":
			return and(
				isNull(deliveryFlags.archivedAt),
				isNull(deliveryFlags.trashedAt),
			);
		case "starred":
			return and(
				isNotNull(deliveryFlags.starredAt),
				isNull(deliveryFlags.trashedAt),
			);
		case "archive":
			return and(
				isNotNull(deliveryFlags.archivedAt),
				isNull(deliveryFlags.trashedAt),
			);
		case "trash":
			return isNotNull(deliveryFlags.trashedAt);
	}
}

/** A listed mailbox item (no body), unified across received and sent scopes. */
export interface MailItemRow {
	id: string;
	scope: MailScope;
	batchId: string;
	reportId: string | null;
	senderName: string;
	senderEmail: string;
	reportName: string;
	dateFrom: string;
	dateTo: string;
	message: string | null;
	readAt: Date | null;
	createdAt: Date;
	starred: boolean;
	archived: boolean;
	trashed: boolean;
	recipientNames: string[];
	recipientCount: number;
}

/** Received items: rows where the caller is the recipient, flagged per row. */
async function listReceived(
	db: Database,
	userId: string,
	folder: MailFolder,
): Promise<MailItemRow[]> {
	const rows = await db
		.select({
			id: reportDeliveries.id,
			batchId: reportDeliveries.batchId,
			reportId: reportDeliveries.reportId,
			senderName: reportDeliveries.senderName,
			senderEmail: reportDeliveries.senderEmail,
			reportName: reportDeliveries.reportName,
			dateFrom: reportDeliveries.dateFrom,
			dateTo: reportDeliveries.dateTo,
			message: reportDeliveries.message,
			readAt: reportDeliveries.readAt,
			createdAt: reportDeliveries.createdAt,
			starredAt: deliveryFlags.starredAt,
			archivedAt: deliveryFlags.archivedAt,
			trashedAt: deliveryFlags.trashedAt,
		})
		.from(reportDeliveries)
		.leftJoin(
			deliveryFlags,
			and(
				eq(deliveryFlags.userId, userId),
				eq(deliveryFlags.scope, "received"),
				eq(deliveryFlags.targetId, reportDeliveries.id),
			),
		)
		.where(
			and(eq(reportDeliveries.recipientUserId, userId), flagPredicate(folder)),
		)
		.orderBy(desc(reportDeliveries.createdAt));

	return rows.map((r) => ({
		id: r.id,
		scope: "received",
		batchId: r.batchId,
		reportId: r.reportId,
		senderName: r.senderName,
		senderEmail: r.senderEmail,
		reportName: r.reportName,
		dateFrom: r.dateFrom,
		dateTo: r.dateTo,
		message: r.message,
		readAt: r.readAt,
		createdAt: r.createdAt,
		starred: r.starredAt != null,
		archived: r.archivedAt != null,
		trashed: r.trashedAt != null,
		recipientNames: [],
		recipientCount: 0,
	}));
}

/** Sent items: the caller's batches, one entry per send, flagged per batch. */
async function listSent(
	db: Database,
	userId: string,
	folder: MailFolder,
): Promise<MailItemRow[]> {
	const rows = await db
		.select({
			// A stable representative delivery id for the batch — the detail route
			// opens it and the server resolves the sent scope from the sender.
			id: sql<string>`min(${reportDeliveries.id})`,
			batchId: reportDeliveries.batchId,
			reportId: sql<string | null>`max(${reportDeliveries.reportId})`,
			senderName: sql<string>`max(${reportDeliveries.senderName})`,
			senderEmail: sql<string>`max(${reportDeliveries.senderEmail})`,
			reportName: sql<string>`max(${reportDeliveries.reportName})`,
			dateFrom: sql<string>`max(${reportDeliveries.dateFrom})`,
			dateTo: sql<string>`max(${reportDeliveries.dateTo})`,
			message: sql<string | null>`max(${reportDeliveries.message})`,
			createdAt: sql<number>`min(${reportDeliveries.createdAt})`,
			recipientNames: sql<string>`group_concat(${user.name}, ${NAME_SEP})`,
			recipientCount: sql<number>`count(*)`,
			starredAt: sql<number | null>`max(${deliveryFlags.starredAt})`,
			archivedAt: sql<number | null>`max(${deliveryFlags.archivedAt})`,
			trashedAt: sql<number | null>`max(${deliveryFlags.trashedAt})`,
		})
		.from(reportDeliveries)
		.innerJoin(user, eq(user.id, reportDeliveries.recipientUserId))
		.leftJoin(
			deliveryFlags,
			and(
				eq(deliveryFlags.userId, userId),
				eq(deliveryFlags.scope, "sent"),
				eq(deliveryFlags.targetId, reportDeliveries.batchId),
			),
		)
		.where(
			and(eq(reportDeliveries.senderUserId, userId), flagPredicate(folder)),
		)
		.groupBy(reportDeliveries.batchId)
		.orderBy(desc(sql`min(${reportDeliveries.createdAt})`));

	return rows.map((r) => ({
		id: r.id,
		scope: "sent",
		batchId: r.batchId,
		reportId: r.reportId,
		senderName: r.senderName,
		senderEmail: r.senderEmail,
		reportName: r.reportName,
		dateFrom: r.dateFrom,
		dateTo: r.dateTo,
		message: r.message,
		readAt: null,
		createdAt: new Date(r.createdAt),
		starred: r.starredAt != null,
		archived: r.archivedAt != null,
		trashed: r.trashedAt != null,
		recipientNames: r.recipientNames ? r.recipientNames.split(NAME_SEP) : [],
		recipientCount: r.recipientCount,
	}));
}

/**
 * Lists a mailbox folder for the caller. Inbox is received-only, Sent is
 * sent-only; Starred/Archive/Trash span both and are merged newest-first.
 */
export async function listMailbox(
	db: Database,
	userId: string,
	folder: MailFolder,
): Promise<MailItemRow[]> {
	if (folder === "inbox") return listReceived(db, userId, folder);
	if (folder === "sent") return listSent(db, userId, folder);
	const [received, sent] = await Promise.all([
		listReceived(db, userId, folder),
		listSent(db, userId, folder),
	]);
	return [...received, ...sent].sort(
		(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
	);
}

async function getDeliveryFlags(
	db: Database,
	userId: string,
	scope: MailScope,
	targetId: string,
): Promise<{ starred: boolean; archived: boolean; trashed: boolean }> {
	const row = await db
		.select({
			starredAt: deliveryFlags.starredAt,
			archivedAt: deliveryFlags.archivedAt,
			trashedAt: deliveryFlags.trashedAt,
		})
		.from(deliveryFlags)
		.where(
			and(
				eq(deliveryFlags.userId, userId),
				eq(deliveryFlags.scope, scope),
				eq(deliveryFlags.targetId, targetId),
			),
		)
		.get();
	return {
		starred: row?.starredAt != null,
		archived: row?.archivedAt != null,
		trashed: row?.trashedAt != null,
	};
}

export type ReceivedDetailRow = MailItemRow & {
	scope: "received";
	renderedMarkdown: string;
};
export type SentDetailRow = MailItemRow & {
	scope: "sent";
	renderedMarkdown: string;
	recipients: { id: string; name: string; email: string }[];
};

/**
 * Opens a mailbox item by delivery id. The caller's relationship to the row
 * picks the view: recipient → received detail, sender → the sent batch detail
 * (so a deep link resolves without the list). Returns undefined if the caller
 * is neither (never reveals another user's mail).
 */
export async function getMailItemDetail(
	db: Database,
	id: string,
	userId: string,
): Promise<ReceivedDetailRow | SentDetailRow | undefined> {
	const row = await db
		.select()
		.from(reportDeliveries)
		.where(eq(reportDeliveries.id, id))
		.get();
	if (!row) return undefined;

	if (row.recipientUserId === userId) {
		const flags = await getDeliveryFlags(db, userId, "received", row.id);
		return {
			id: row.id,
			scope: "received",
			batchId: row.batchId,
			reportId: row.reportId,
			senderName: row.senderName,
			senderEmail: row.senderEmail,
			reportName: row.reportName,
			dateFrom: row.dateFrom,
			dateTo: row.dateTo,
			message: row.message,
			readAt: row.readAt,
			createdAt: row.createdAt,
			...flags,
			recipientNames: [],
			recipientCount: 0,
			renderedMarkdown: row.renderedMarkdown,
		};
	}

	if (row.senderUserId === userId) {
		const recipients = await db
			.select({ id: user.id, name: user.name, email: user.email })
			.from(reportDeliveries)
			.innerJoin(user, eq(user.id, reportDeliveries.recipientUserId))
			.where(
				and(
					eq(reportDeliveries.batchId, row.batchId),
					eq(reportDeliveries.senderUserId, userId),
				),
			)
			.orderBy(user.name);
		const flags = await getDeliveryFlags(db, userId, "sent", row.batchId);
		return {
			id: row.id,
			scope: "sent",
			batchId: row.batchId,
			reportId: row.reportId,
			senderName: row.senderName,
			senderEmail: row.senderEmail,
			reportName: row.reportName,
			dateFrom: row.dateFrom,
			dateTo: row.dateTo,
			message: row.message,
			readAt: null,
			createdAt: row.createdAt,
			...flags,
			recipientNames: recipients.map((r) => r.name),
			recipientCount: recipients.length,
			renderedMarkdown: row.renderedMarkdown,
			recipients,
		};
	}

	return undefined;
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

/**
 * Confirms the caller owns a flag target: a received delivery they received, or
 * a sent batch they sent. Guards the flag endpoint against flagging others' mail.
 */
export async function userOwnsMailTarget(
	db: Database,
	userId: string,
	scope: MailScope,
	targetId: string,
): Promise<boolean> {
	const predicate =
		scope === "received"
			? and(
					eq(reportDeliveries.id, targetId),
					eq(reportDeliveries.recipientUserId, userId),
				)
			: and(
					eq(reportDeliveries.batchId, targetId),
					eq(reportDeliveries.senderUserId, userId),
				);
	const row = await db
		.select({ id: reportDeliveries.id })
		.from(reportDeliveries)
		.where(predicate)
		.get();
	return row != null;
}

/** Upserts the caller's flags on a target; an undefined flag is left unchanged. */
export async function setDeliveryFlags(
	db: Database,
	target: { userId: string; scope: MailScope; targetId: string },
	flags: { starred?: boolean; archived?: boolean; trashed?: boolean },
): Promise<void> {
	const set: {
		starredAt?: Date | null;
		archivedAt?: Date | null;
		trashedAt?: Date | null;
	} = {};
	const now = new Date();
	if (flags.starred !== undefined) set.starredAt = flags.starred ? now : null;
	if (flags.archived !== undefined)
		set.archivedAt = flags.archived ? now : null;
	if (flags.trashed !== undefined) set.trashedAt = flags.trashed ? now : null;
	await db
		.insert(deliveryFlags)
		.values({
			id: crypto.randomUUID(),
			userId: target.userId,
			scope: target.scope,
			targetId: target.targetId,
			...set,
		})
		.onConflictDoUpdate({
			target: [
				deliveryFlags.userId,
				deliveryFlags.scope,
				deliveryFlags.targetId,
			],
			set,
		});
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

/**
 * Unread Inbox badge: received, unread, and still in the Inbox (an archived or
 * trashed message drops out of the count, like Gmail).
 */
export async function countUnreadInbox(
	db: Database,
	userId: string,
): Promise<number> {
	const row = await db
		.select({ count: sql<number>`count(*)` })
		.from(reportDeliveries)
		.leftJoin(
			deliveryFlags,
			and(
				eq(deliveryFlags.userId, userId),
				eq(deliveryFlags.scope, "received"),
				eq(deliveryFlags.targetId, reportDeliveries.id),
			),
		)
		.where(
			and(
				eq(reportDeliveries.recipientUserId, userId),
				isNull(reportDeliveries.readAt),
				isNull(deliveryFlags.archivedAt),
				isNull(deliveryFlags.trashedAt),
			),
		)
		.get();
	return row?.count ?? 0;
}

/** Counts for the mailbox sidebar — every folder plus the unread Inbox badge. */
export async function countFolders(
	db: Database,
	userId: string,
): Promise<{
	inbox: number;
	unread: number;
	starred: number;
	sent: number;
	archive: number;
	trash: number;
}> {
	const folders: MailFolder[] = [
		"inbox",
		"starred",
		"sent",
		"archive",
		"trash",
	];
	const [entries, unread] = await Promise.all([
		Promise.all(
			folders.map(
				async (f) => [f, (await listMailbox(db, userId, f)).length] as const,
			),
		),
		countUnreadInbox(db, userId),
	]);
	const byFolder = Object.fromEntries(entries) as Record<MailFolder, number>;
	return {
		inbox: byFolder.inbox,
		unread,
		starred: byFolder.starred,
		sent: byFolder.sent,
		archive: byFolder.archive,
		trash: byFolder.trash,
	};
}
