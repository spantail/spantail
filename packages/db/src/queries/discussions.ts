import { and, asc, eq, isNull } from "drizzle-orm";

import type { Database } from "../index";
import { reportDeliveries } from "../schema/deliveries";
import { reportComments, reportReactions } from "../schema/discussions";
import { reportContent, reports } from "../schema/reports";

export type ReportCommentRow = typeof reportComments.$inferSelect;
export type ReportReactionRow = typeof reportReactions.$inferSelect;

export interface ReportDiscussionAccess {
	report: { id: string; ownerUserId: string };
	isOwner: boolean;
	isRecipient: boolean;
	/** The version has been Send-to-shared (≥1 delivery of it exists). */
	shared: boolean;
}

/**
 * Resolves whether a user may take part in a content version's discussion. A
 * participant is the report owner (sender) or anyone holding a Send-to delivery
 * of that version. Returns undefined when the version is missing or the caller
 * is neither — the caller treats that as "not found", never revealing the
 * version's existence.
 */
export async function getReportDiscussionAccess(
	db: Database,
	reportContentId: string,
	userId: string,
): Promise<ReportDiscussionAccess | undefined> {
	const report = await db
		.select({ id: reports.id, ownerUserId: reports.ownerUserId })
		.from(reportContent)
		.innerJoin(reports, eq(reports.id, reportContent.reportId))
		.where(eq(reportContent.id, reportContentId))
		.get();
	if (!report) return undefined;

	const isOwner = report.ownerUserId === userId;
	const recipient = await db
		.select({ id: reportDeliveries.id })
		.from(reportDeliveries)
		.where(
			and(
				eq(reportDeliveries.reportContentId, reportContentId),
				eq(reportDeliveries.recipientUserId, userId),
			),
		)
		.get();
	const isRecipient = recipient !== undefined;
	if (!isOwner && !isRecipient) return undefined;

	// A recipient implies a delivery; only the owner-without-delivery case needs
	// the extra check.
	const shared = isRecipient
		? true
		: await isContentShared(db, reportContentId);
	return { report, isOwner, isRecipient, shared };
}

/**
 * The user ids of a content version's discussion participants: the report owner
 * plus every Send-to recipient of that version. Used to fan out a realtime
 * signal when the discussion changes. A recipient whose account was deleted has
 * no delivery row, so they are naturally excluded.
 */
export async function listReportParticipantUserIds(
	db: Database,
	reportContentId: string,
): Promise<string[]> {
	const report = await db
		.select({ ownerUserId: reports.ownerUserId })
		.from(reportContent)
		.innerJoin(reports, eq(reports.id, reportContent.reportId))
		.where(eq(reportContent.id, reportContentId))
		.get();
	if (!report) return [];
	const recipients = await db
		.select({ userId: reportDeliveries.recipientUserId })
		.from(reportDeliveries)
		.where(eq(reportDeliveries.reportContentId, reportContentId));
	const ids = new Set<string>([report.ownerUserId]);
	for (const r of recipients) {
		if (r.userId) ids.add(r.userId);
	}
	return [...ids];
}

/**
 * Whether a content version's discussion exists: ≥1 delivery, comment, or
 * reaction on that version. An existing discussion counts as shared even with
 * no live delivery — when the last recipient's account is deleted their
 * delivery cascades away, but retained comments (author_user_id set null) keep
 * the thread alive. Used to surface the `shared` flag to the owner and to
 * admin readers who hold no delivery.
 */
export async function isContentShared(
	db: Database,
	reportContentId: string,
): Promise<boolean> {
	const [anyDelivery, anyComment, anyReaction] = await Promise.all([
		db
			.select({ id: reportDeliveries.id })
			.from(reportDeliveries)
			.where(eq(reportDeliveries.reportContentId, reportContentId))
			.get(),
		db
			.select({ id: reportComments.id })
			.from(reportComments)
			.where(eq(reportComments.reportContentId, reportContentId))
			.get(),
		db
			.select({ id: reportReactions.id })
			.from(reportReactions)
			.where(eq(reportReactions.reportContentId, reportContentId))
			.get(),
	]);
	return (
		anyDelivery !== undefined ||
		anyComment !== undefined ||
		anyReaction !== undefined
	);
}

/** A content version's comments, oldest first (thread order). */
export async function listReportComments(
	db: Database,
	reportContentId: string,
): Promise<ReportCommentRow[]> {
	return db
		.select()
		.from(reportComments)
		.where(eq(reportComments.reportContentId, reportContentId))
		.orderBy(asc(reportComments.createdAt));
}

/** A single comment, scoped to its content version. */
export async function getReportComment(
	db: Database,
	id: string,
	reportContentId: string,
): Promise<ReportCommentRow | undefined> {
	return db
		.select()
		.from(reportComments)
		.where(
			and(
				eq(reportComments.id, id),
				eq(reportComments.reportContentId, reportContentId),
			),
		)
		.get();
}

export async function createReportComment(
	db: Database,
	values: {
		reportContentId: string;
		authorUserId: string;
		authorName: string;
		authorEmail: string;
		body: string;
	},
): Promise<ReportCommentRow> {
	const row = await db
		.insert(reportComments)
		.values({ id: crypto.randomUUID(), ...values })
		.returning()
		.get();
	return row;
}

/** Edits a comment's body; scoped to its author so no one edits another's. */
export async function updateReportComment(
	db: Database,
	id: string,
	reportContentId: string,
	userId: string,
	body: string,
): Promise<ReportCommentRow | undefined> {
	return db
		.update(reportComments)
		.set({ body })
		.where(
			and(
				eq(reportComments.id, id),
				eq(reportComments.reportContentId, reportContentId),
				eq(reportComments.authorUserId, userId),
			),
		)
		.returning()
		.get();
}

/** Deletes a comment; scoped to its author. Returns whether a row was removed. */
export async function deleteReportComment(
	db: Database,
	id: string,
	reportContentId: string,
	userId: string,
): Promise<boolean> {
	const deleted = await db
		.delete(reportComments)
		.where(
			and(
				eq(reportComments.id, id),
				eq(reportComments.reportContentId, reportContentId),
				eq(reportComments.authorUserId, userId),
			),
		)
		.returning({ id: reportComments.id });
	return deleted.length > 0;
}

/** Every reaction for a content version (body- and comment-level); aggregated
 * by callers. */
export async function listReportReactions(
	db: Database,
	reportContentId: string,
): Promise<ReportReactionRow[]> {
	return db
		.select()
		.from(reportReactions)
		.where(eq(reportReactions.reportContentId, reportContentId));
}

/**
 * Toggles one emoji for a user on a target (the version's body when commentId
 * is null, else a comment). Returns true if it was added, false if it was
 * removed.
 *
 * Delete-then-insert (rather than select-then-write) keeps it tolerant of
 * concurrent requests: two tabs adding the same emoji both delete nothing and
 * both insert, but the second insert hits the partial unique index and is
 * ignored via onConflictDoNothing instead of surfacing a 500.
 */
export async function toggleReportReaction(
	db: Database,
	values: {
		reportContentId: string;
		commentId: string | null;
		userId: string;
		userName: string;
		emoji: string;
	},
): Promise<boolean> {
	const { reportContentId, commentId, userId, userName, emoji } = values;
	const removed = await db
		.delete(reportReactions)
		.where(
			and(
				eq(reportReactions.reportContentId, reportContentId),
				commentId === null
					? isNull(reportReactions.commentId)
					: eq(reportReactions.commentId, commentId),
				eq(reportReactions.userId, userId),
				eq(reportReactions.emoji, emoji),
			),
		)
		.returning({ id: reportReactions.id });
	if (removed.length > 0) return false;

	await db
		.insert(reportReactions)
		.values({
			id: crypto.randomUUID(),
			reportContentId,
			commentId,
			userId,
			userName,
			emoji,
		})
		.onConflictDoNothing();
	return true;
}
