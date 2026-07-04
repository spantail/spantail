import type { MailFolder, MailScope } from "@spantail/core";
import {
	and,
	desc,
	eq,
	isNotNull,
	isNull,
	notExists,
	or,
	sql,
} from "drizzle-orm";
import type { Database } from "../index";
import { user } from "../schema/auth";
import { reportDeliveries } from "../schema/deliveries";
import { deliveryFlags } from "../schema/delivery-flags";
import { reportContent, reports } from "../schema/reports";

// Deliveries belong to exactly one source report; a report scoped to a single
// workspace is the unit a workspace admin may read (`R*`). Multi-workspace
// reports stay instance-admin-only, mirroring listReportMetaByWorkspace.
const singleWorkspaceReport = (workspaceId: string) => sql`(
	json_array_length(json_extract(${reports.filters}, '$.workspaceIds')) = 1
	and exists (select 1 from json_each(json_extract(${reports.filters}, '$.workspaceIds')) where value = ${workspaceId})
)`;

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

// A delivery's batch key: its batch_id, or its own id when batch_id is NULL (a
// send handled by the pre-deploy Worker, before batch_id was populated). This
// makes such a row behave as a singleton batch instead of a null grouping key.
const batchKey = sql<string>`coalesce(${reportDeliveries.batchId}, ${reportDeliveries.id})`;

// A self-copy row (recipient === sender) is an inbox-only convenience: it shows
// in the sender's Inbox but is excluded from the Sent scope, so it never pollutes
// the batch's recipient list/count and the Sent representative row is always a
// real recipient (keeping getMailItemDetail's received/sent resolution stable).
const notSelfCopy = sql`${reportDeliveries.recipientUserId} != ${reportDeliveries.senderUserId}`;

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

/**
 * A listed mailbox item (no body), unified across received and sent scopes. The
 * avatar fields are raw (a `user.image` token/URL plus the user id needed to
 * resolve it); the route turns them into ready-to-use URLs via resolveAvatarUrl.
 */
export interface MailItemRow {
	id: string;
	scope: MailScope;
	batchId: string;
	reportId: string | null;
	senderName: string;
	senderEmail: string;
	// Received scope: the sender's user id + stored image (live-joined, so a
	// deleted sender yields null → the initials fallback). Unused for sent.
	senderUserId: string | null;
	senderImage: string | null;
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
	// Sent scope: recipient ids + stored images, aligned by index with
	// recipientNames so the route can resolve each avatar. Empty for received.
	recipientIds: string[];
	recipientImages: (string | null)[];
	recipientCount: number;
}

/** Received items: rows where the caller is the recipient, flagged per row. */
async function listReceived(
	db: Database,
	userId: string,
	folder: MailFolder,
	limit?: number,
	offset?: number,
): Promise<MailItemRow[]> {
	const query = db
		.select({
			id: reportDeliveries.id,
			batchId: reportDeliveries.batchId,
			reportId: reportDeliveries.reportId,
			senderName: reportDeliveries.senderName,
			senderEmail: reportDeliveries.senderEmail,
			senderUserId: reportDeliveries.senderUserId,
			senderImage: user.image,
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
		// Live-join the sender for their current avatar; left so a deleted sender
		// (senderUserId set null) still returns the row with a null image.
		.leftJoin(user, eq(user.id, reportDeliveries.senderUserId))
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
		// id breaks createdAt ties so offset paging is stable.
		.orderBy(desc(reportDeliveries.createdAt), desc(reportDeliveries.id))
		.$dynamic();
	if (limit !== undefined) query.limit(limit).offset(offset ?? 0);
	const rows = await query;

	return rows.map((r) => ({
		id: r.id,
		scope: "received",
		batchId: r.batchId ?? r.id,
		reportId: r.reportId,
		senderName: r.senderName,
		senderEmail: r.senderEmail,
		senderUserId: r.senderUserId,
		senderImage: r.senderImage,
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
		recipientIds: [],
		recipientImages: [],
		recipientCount: 0,
	}));
}

/** Sent items: the caller's batches, one entry per send, flagged per batch. */
async function listSent(
	db: Database,
	userId: string,
	folder: MailFolder,
	limit?: number,
	offset?: number,
): Promise<MailItemRow[]> {
	const query = db
		.select({
			// A stable representative delivery id for the batch — the detail route
			// opens it and the server resolves the sent scope from the sender.
			id: sql<string>`min(${reportDeliveries.id})`,
			batchId: batchKey,
			reportId: sql<string | null>`max(${reportDeliveries.reportId})`,
			senderName: sql<string>`max(${reportDeliveries.senderName})`,
			senderEmail: sql<string>`max(${reportDeliveries.senderEmail})`,
			senderUserId: sql<string | null>`max(${reportDeliveries.senderUserId})`,
			reportName: sql<string>`max(${reportDeliveries.reportName})`,
			dateFrom: sql<string>`max(${reportDeliveries.dateFrom})`,
			dateTo: sql<string>`max(${reportDeliveries.dateTo})`,
			message: sql<string | null>`max(${reportDeliveries.message})`,
			createdAt: sql<number>`min(${reportDeliveries.createdAt})`,
			// Three concats over the same grouped rows stay index-aligned: SQLite
			// feeds every aggregate in a group the same row order. names/ids are
			// non-null; image is coalesced to "" to hold its slot (mapped back to
			// null below) so it never drops out and shifts the columns.
			recipientNames: sql<string>`group_concat(${user.name}, ${NAME_SEP})`,
			recipientIds: sql<string>`group_concat(${user.id}, ${NAME_SEP})`,
			recipientImages: sql<string>`group_concat(coalesce(${user.image}, ''), ${NAME_SEP})`,
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
				eq(deliveryFlags.targetId, batchKey),
			),
		)
		.where(
			and(
				eq(reportDeliveries.senderUserId, userId),
				notSelfCopy,
				flagPredicate(folder),
			),
		)
		.groupBy(batchKey)
		// batchKey breaks createdAt ties so offset paging is stable.
		.orderBy(desc(sql`min(${reportDeliveries.createdAt})`), desc(batchKey))
		.$dynamic();
	if (limit !== undefined) query.limit(limit).offset(offset ?? 0);
	const rows = await query;

	return rows.map((r) => ({
		id: r.id,
		scope: "sent",
		batchId: r.batchId,
		reportId: r.reportId,
		senderName: r.senderName,
		senderEmail: r.senderEmail,
		// Sent rows show the recipient's avatar, not the sender's; carry the
		// sender id for shape uniformity but no sender image is joined here.
		senderUserId: r.senderUserId,
		senderImage: null,
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
		recipientIds: r.recipientIds ? r.recipientIds.split(NAME_SEP) : [],
		// "" placeholder (a recipient with no avatar) maps back to null.
		recipientImages: r.recipientImages
			? r.recipientImages.split(NAME_SEP).map((img) => img || null)
			: [],
		recipientCount: r.recipientCount,
	}));
}

export interface ReportSendRow {
	id: string;
	createdAt: Date;
	message: string | null;
	recipientNames: string[];
	recipientCount: number;
	readCount: number;
}

// A row addressed to someone other than the sender (i.e. a real recipient, not
// a self-copy). Unlike the Sent folder — which drops self-only batches — the
// per-report history keeps every send the owner performed, so this filters the
// aggregates (names/counts/reads) rather than the rows: a self-only send stays
// as a batch with zero recipients instead of disappearing.
const isRealRecipient = sql`${reportDeliveries.recipientUserId} != ${reportDeliveries.senderUserId}`;

/**
 * A report's send history for its owner: one entry per "Send to" batch, newest
 * first. Scoped to a single report + sender, no folder/flag joins. Self-copies
 * are excluded from `recipientNames`/`recipientCount`/`readCount` but never drop
 * the batch, so a self-only send still appears (with zero recipients).
 */
export async function listReportSendsByReport(
	db: Database,
	reportId: string,
	senderUserId: string,
): Promise<ReportSendRow[]> {
	const rows = await db
		.select({
			id: batchKey,
			createdAt: sql<number>`min(${reportDeliveries.createdAt})`,
			message: sql<string | null>`max(${reportDeliveries.message})`,
			recipientNames: sql<
				string | null
			>`group_concat(case when ${isRealRecipient} then ${user.name} end, ${NAME_SEP})`,
			recipientCount: sql<number>`sum(case when ${isRealRecipient} then 1 else 0 end)`,
			readCount: sql<number>`sum(case when ${isRealRecipient} and ${reportDeliveries.readAt} is not null then 1 else 0 end)`,
		})
		.from(reportDeliveries)
		.innerJoin(user, eq(user.id, reportDeliveries.recipientUserId))
		.where(
			and(
				eq(reportDeliveries.reportId, reportId),
				eq(reportDeliveries.senderUserId, senderUserId),
			),
		)
		.groupBy(batchKey)
		.orderBy(desc(sql`min(${reportDeliveries.createdAt})`), desc(batchKey));
	return rows.map((r) => ({
		id: r.id,
		createdAt: new Date(r.createdAt),
		message: r.message,
		recipientNames: r.recipientNames ? r.recipientNames.split(NAME_SEP) : [],
		recipientCount: Number(r.recipientCount ?? 0),
		readCount: Number(r.readCount ?? 0),
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
	limit?: number,
	offset?: number,
): Promise<MailItemRow[]> {
	if (folder === "inbox")
		return listReceived(db, userId, folder, limit, offset);
	if (folder === "sent") return listSent(db, userId, folder, limit, offset);
	// Merged folders interleave both scopes newest-first. The merged item at any
	// global index draws from at most that index of either branch, so fetching
	// offset+limit from each branch is enough to slice the requested page (or
	// the whole branch when unbounded).
	const off = offset ?? 0;
	const cap = limit === undefined ? undefined : off + limit;
	const [received, sent] = await Promise.all([
		listReceived(db, userId, folder, cap, 0),
		listSent(db, userId, folder, cap, 0),
	]);
	const merged = [...received, ...sent].sort(
		(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
	);
	return limit === undefined ? merged : merged.slice(off, off + limit);
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
	recipients: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	}[];
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
		// Live-look up the sender's current avatar (null if the account is gone).
		const sender = row.senderUserId
			? await db
					.select({ image: user.image })
					.from(user)
					.where(eq(user.id, row.senderUserId))
					.get()
			: undefined;
		return {
			id: row.id,
			scope: "received",
			batchId: row.batchId ?? row.id,
			reportId: row.reportId,
			senderName: row.senderName,
			senderEmail: row.senderEmail,
			senderUserId: row.senderUserId,
			senderImage: sender?.image ?? null,
			reportName: row.reportName,
			dateFrom: row.dateFrom,
			dateTo: row.dateTo,
			message: row.message,
			readAt: row.readAt,
			createdAt: row.createdAt,
			...flags,
			recipientNames: [],
			recipientIds: [],
			recipientImages: [],
			recipientCount: 0,
			renderedMarkdown: row.renderedMarkdown,
		};
	}

	if (row.senderUserId === userId) {
		// The batch key the rest of the API flags and routes by.
		const key = row.batchId ?? row.id;
		const recipients = await db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
			})
			.from(reportDeliveries)
			.innerJoin(user, eq(user.id, reportDeliveries.recipientUserId))
			.where(
				and(
					eq(batchKey, key),
					eq(reportDeliveries.senderUserId, userId),
					notSelfCopy,
				),
			)
			.orderBy(user.name);
		const flags = await getDeliveryFlags(db, userId, "sent", key);
		return {
			id: row.id,
			scope: "sent",
			batchId: key,
			reportId: row.reportId,
			senderName: row.senderName,
			senderEmail: row.senderEmail,
			reportName: row.reportName,
			dateFrom: row.dateFrom,
			dateTo: row.dateTo,
			message: row.message,
			senderUserId: row.senderUserId,
			senderImage: null,
			readAt: null,
			createdAt: row.createdAt,
			...flags,
			recipientNames: recipients.map((r) => r.name),
			recipientIds: recipients.map((r) => r.id),
			recipientImages: recipients.map((r) => r.image),
			recipientCount: recipients.length,
			renderedMarkdown: row.renderedMarkdown,
			recipients,
		};
	}

	return undefined;
}

/**
 * Deliveries whose source report is scoped to exactly this one workspace — a
 * workspace admin's `R*` view of inbox/deliveries (every recipient's copy,
 * newest-first). No per-user flags: the admin is not the recipient.
 */
export async function listDeliveriesByWorkspace(
	db: Database,
	workspaceId: string,
	limit?: number,
	offset?: number,
): Promise<MailItemRow[]> {
	const query = db
		.select({
			id: reportDeliveries.id,
			batchId: reportDeliveries.batchId,
			reportId: reportDeliveries.reportId,
			senderName: reportDeliveries.senderName,
			senderEmail: reportDeliveries.senderEmail,
			senderUserId: reportDeliveries.senderUserId,
			senderImage: user.image,
			reportName: reportDeliveries.reportName,
			dateFrom: reportDeliveries.dateFrom,
			dateTo: reportDeliveries.dateTo,
			message: reportDeliveries.message,
			createdAt: reportDeliveries.createdAt,
		})
		.from(reportDeliveries)
		.innerJoin(reports, eq(reports.id, reportDeliveries.reportId))
		.leftJoin(user, eq(user.id, reportDeliveries.senderUserId))
		.where(singleWorkspaceReport(workspaceId))
		// id breaks createdAt ties so offset paging is stable.
		.orderBy(desc(reportDeliveries.createdAt), desc(reportDeliveries.id))
		.$dynamic();
	if (limit !== undefined) query.limit(limit).offset(offset ?? 0);
	const rows = await query;
	return rows.map((r) => ({
		id: r.id,
		scope: "received",
		batchId: r.batchId ?? r.id,
		reportId: r.reportId,
		senderName: r.senderName,
		senderEmail: r.senderEmail,
		senderUserId: r.senderUserId,
		senderImage: r.senderImage,
		reportName: r.reportName,
		dateFrom: r.dateFrom,
		dateTo: r.dateTo,
		message: r.message,
		// readAt is the recipient's own read-state; an admin is not the recipient,
		// so it is never surfaced in this cross-recipient view.
		readAt: null,
		createdAt: r.createdAt,
		starred: false,
		archived: false,
		trashed: false,
		recipientNames: [],
		recipientIds: [],
		recipientImages: [],
		recipientCount: 0,
	}));
}

/**
 * Admin read of any delivery by id as a received-detail view (no per-user flags
 * — the admin is not the recipient). Authorization (instance admin for any
 * delivery, or a workspace admin of the report's single workspace) is enforced
 * by the caller, which uses the returned `reportId` to scope-check.
 */
export async function getDeliveryDetailById(
	db: Database,
	id: string,
): Promise<ReceivedDetailRow | undefined> {
	const row = await db
		.select()
		.from(reportDeliveries)
		.where(eq(reportDeliveries.id, id))
		.get();
	if (!row) return undefined;
	const sender = row.senderUserId
		? await db
				.select({ image: user.image })
				.from(user)
				.where(eq(user.id, row.senderUserId))
				.get()
		: undefined;
	return {
		id: row.id,
		scope: "received",
		batchId: row.batchId ?? row.id,
		reportId: row.reportId,
		senderName: row.senderName,
		senderEmail: row.senderEmail,
		senderUserId: row.senderUserId,
		senderImage: sender?.image ?? null,
		reportName: row.reportName,
		dateFrom: row.dateFrom,
		dateTo: row.dateTo,
		message: row.message,
		// readAt is the recipient's own read-state, not the admin's; never leak it.
		readAt: null,
		createdAt: row.createdAt,
		starred: false,
		archived: false,
		trashed: false,
		recipientNames: [],
		recipientIds: [],
		recipientImages: [],
		recipientCount: 0,
		renderedMarkdown: row.renderedMarkdown,
	};
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
 * The content version a delivery carried. Normally the recorded
 * `reportContentId`; a row inserted by a pre-column Worker during rollout
 * (after the migration backfill already ran) is resolved by content equality
 * instead — the frozen body is a byte-for-byte copy of the sent version, and
 * version bodies are unique per report (the front matter embeds the version
 * number). The resolved id is written back so the repair runs once per row.
 * Null only when no version matches (which cascade rules make unreachable
 * while the delivery exists).
 */
export async function resolveDeliveredContentId(
	db: Database,
	delivery: ReportDeliveryRow,
): Promise<string | null> {
	if (delivery.reportContentId) return delivery.reportContentId;
	if (!delivery.reportId) return null;
	const version = await db
		.select({ id: reportContent.id })
		.from(reportContent)
		.where(
			and(
				eq(reportContent.reportId, delivery.reportId),
				eq(reportContent.content, delivery.renderedMarkdown),
			),
		)
		.get();
	if (!version) return null;
	await db
		.update(reportDeliveries)
		.set({ reportContentId: version.id })
		.where(eq(reportDeliveries.id, delivery.id));
	return version.id;
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
			: and(eq(batchKey, targetId), eq(reportDeliveries.senderUserId, userId));
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

/**
 * Marks every unread Inbox message read. Archived or trashed unread messages
 * are left alone — they aren't in the Inbox the user is clearing, and marking
 * them read would silently change their state if they were ever restored.
 */
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
				notExists(
					db
						.select({ one: sql`1` })
						.from(deliveryFlags)
						.where(
							and(
								eq(deliveryFlags.userId, userId),
								eq(deliveryFlags.scope, "received"),
								eq(deliveryFlags.targetId, reportDeliveries.id),
								or(
									isNotNull(deliveryFlags.archivedAt),
									isNotNull(deliveryFlags.trashedAt),
								),
							),
						),
				),
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

/** Received items matching a folder predicate (mirrors listReceived's filter). */
async function countReceived(
	db: Database,
	userId: string,
	folder: MailFolder,
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
			and(eq(reportDeliveries.recipientUserId, userId), flagPredicate(folder)),
		)
		.get();
	return row?.count ?? 0;
}

/** Sent batches matching a folder predicate (mirrors listSent's grouping). */
async function countSentBatches(
	db: Database,
	userId: string,
	folder: MailFolder,
): Promise<number> {
	const groups = db
		.select({ batchId: batchKey })
		.from(reportDeliveries)
		.innerJoin(user, eq(user.id, reportDeliveries.recipientUserId))
		.leftJoin(
			deliveryFlags,
			and(
				eq(deliveryFlags.userId, userId),
				eq(deliveryFlags.scope, "sent"),
				eq(deliveryFlags.targetId, batchKey),
			),
		)
		.where(
			and(
				eq(reportDeliveries.senderUserId, userId),
				notSelfCopy,
				flagPredicate(folder),
			),
		)
		.groupBy(batchKey)
		.as("sent_groups");
	const row = await db
		.select({ count: sql<number>`count(*)` })
		.from(groups)
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
	// Folder semantics mirror listMailbox: inbox is received-only, sent is
	// sent-only, and starred/archive/trash span both scopes.
	const [inbox, starred, sent, archive, trash, unread] = await Promise.all([
		countReceived(db, userId, "inbox"),
		Promise.all([
			countReceived(db, userId, "starred"),
			countSentBatches(db, userId, "starred"),
		]).then(([r, s]) => r + s),
		countSentBatches(db, userId, "sent"),
		Promise.all([
			countReceived(db, userId, "archive"),
			countSentBatches(db, userId, "archive"),
		]).then(([r, s]) => r + s),
		Promise.all([
			countReceived(db, userId, "trash"),
			countSentBatches(db, userId, "trash"),
		]).then(([r, s]) => r + s),
		countUnreadInbox(db, userId),
	]);
	return { inbox, unread, starred, sent, archive, trash };
}
