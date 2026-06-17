import { and, asc, eq, isNull } from "drizzle-orm";

import type { Database } from "../index";
import { reportDeliveries } from "../schema/deliveries";
import { reportComments, reportReactions } from "../schema/discussions";
import { reports } from "../schema/reports";

export type ReportCommentRow = typeof reportComments.$inferSelect;
export type ReportReactionRow = typeof reportReactions.$inferSelect;

export interface ReportDiscussionAccess {
	report: { id: string; ownerUserId: string };
	isOwner: boolean;
	isRecipient: boolean;
	/** The report has been Send-to-shared (≥1 delivery exists). */
	shared: boolean;
}

/**
 * Resolves whether a user may take part in a report's discussion. A participant
 * is the report owner (sender) or anyone holding a Send-to delivery of it.
 * Returns undefined when the report is missing or the caller is neither — the
 * caller treats that as "not found", never revealing the report's existence.
 */
export async function getReportDiscussionAccess(
	db: Database,
	reportId: string,
	userId: string,
): Promise<ReportDiscussionAccess | undefined> {
	const report = await db
		.select({ id: reports.id, ownerUserId: reports.ownerUserId })
		.from(reports)
		.where(eq(reports.id, reportId))
		.get();
	if (!report) return undefined;

	const isOwner = report.ownerUserId === userId;
	const recipient = await db
		.select({ id: reportDeliveries.id })
		.from(reportDeliveries)
		.where(
			and(
				eq(reportDeliveries.reportId, reportId),
				eq(reportDeliveries.recipientUserId, userId),
			),
		)
		.get();
	const isRecipient = recipient !== undefined;
	if (!isOwner && !isRecipient) return undefined;

	// A recipient implies a delivery; only the owner-without-delivery case needs
	// the extra existence check.
	let shared = isRecipient;
	if (!shared) {
		const anyDelivery = await db
			.select({ id: reportDeliveries.id })
			.from(reportDeliveries)
			.where(eq(reportDeliveries.reportId, reportId))
			.get();
		shared = anyDelivery !== undefined;
	}

	return { report, isOwner, isRecipient, shared };
}

/** A report's comments, oldest first (thread order). */
export async function listReportComments(
	db: Database,
	reportId: string,
): Promise<ReportCommentRow[]> {
	return db
		.select()
		.from(reportComments)
		.where(eq(reportComments.reportId, reportId))
		.orderBy(asc(reportComments.createdAt));
}

/** A single comment, scoped to its report. */
export async function getReportComment(
	db: Database,
	id: string,
	reportId: string,
): Promise<ReportCommentRow | undefined> {
	return db
		.select()
		.from(reportComments)
		.where(
			and(eq(reportComments.id, id), eq(reportComments.reportId, reportId)),
		)
		.get();
}

export async function createReportComment(
	db: Database,
	values: {
		reportId: string;
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
	reportId: string,
	userId: string,
	body: string,
): Promise<ReportCommentRow | undefined> {
	return db
		.update(reportComments)
		.set({ body })
		.where(
			and(
				eq(reportComments.id, id),
				eq(reportComments.reportId, reportId),
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
	reportId: string,
	userId: string,
): Promise<boolean> {
	const deleted = await db
		.delete(reportComments)
		.where(
			and(
				eq(reportComments.id, id),
				eq(reportComments.reportId, reportId),
				eq(reportComments.authorUserId, userId),
			),
		)
		.returning({ id: reportComments.id });
	return deleted.length > 0;
}

/** Every reaction for a report (body- and comment-level); aggregated by callers. */
export async function listReportReactions(
	db: Database,
	reportId: string,
): Promise<ReportReactionRow[]> {
	return db
		.select()
		.from(reportReactions)
		.where(eq(reportReactions.reportId, reportId));
}

/**
 * Toggles one emoji for a user on a target (report body when commentId is null,
 * else a comment). Returns true if it was added, false if it was removed.
 */
export async function toggleReportReaction(
	db: Database,
	values: {
		reportId: string;
		commentId: string | null;
		userId: string;
		userName: string;
		emoji: string;
	},
): Promise<boolean> {
	const { reportId, commentId, userId, userName, emoji } = values;
	const existing = await db
		.select({ id: reportReactions.id })
		.from(reportReactions)
		.where(
			and(
				eq(reportReactions.reportId, reportId),
				commentId === null
					? isNull(reportReactions.commentId)
					: eq(reportReactions.commentId, commentId),
				eq(reportReactions.userId, userId),
				eq(reportReactions.emoji, emoji),
			),
		)
		.get();

	if (existing) {
		await db.delete(reportReactions).where(eq(reportReactions.id, existing.id));
		return false;
	}

	await db.insert(reportReactions).values({
		id: crypto.randomUUID(),
		reportId,
		commentId,
		userId,
		userName,
		emoji,
	});
	return true;
}
