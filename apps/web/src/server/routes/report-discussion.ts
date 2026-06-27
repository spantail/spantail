import type { AuthUser } from "@spantail/core";
import {
	createCommentInputSchema,
	toggleReactionInputSchema,
	updateCommentInputSchema,
} from "@spantail/core";
import {
	createReportComment,
	deleteReportComment,
	getReportComment,
	getReportDiscussionAccess,
	isReportShared,
	listReportComments,
	listReportReactions,
	listUsersByIds,
	type ReportReactionRow,
	toggleReportReaction,
	updateReportComment,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { resolveAvatarUrl } from "../lib/avatar";
import { toApiComment, toReactionSummaries } from "../lib/discussion-api";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import { publishToReportParticipants } from "../realtime/publish";
import type { AppEnv } from "../types";
import { requireReportReadAccess } from "./reports";

/**
 * Resolves the caller as a discussion participant (report owner or a Send-to
 * recipient). Non-participants get a 404 — the report's existence is never
 * revealed, matching requireReportOwner. Mutations additionally require the
 * report to have been shared (≥1 delivery); the owner of an unsent report can
 * read the empty discussion but not write to it.
 */
async function requireParticipant(
	c: Context<AppEnv>,
	reportId: string,
	scope: "read" | "write",
): Promise<{ user: AuthUser; shared: boolean }> {
	const { user } = requireScope(c, scope);
	const access = await getReportDiscussionAccess(c.var.db, reportId, user.id);
	if (!access) throw new AppError("not_found", "Report not found");
	if (scope === "write" && !access.shared) {
		throw new AppError(
			"bad_request",
			"Discussion is not available for this report",
		);
	}
	return { user, shared: access.shared };
}

/** Body-level reactions are those with no comment id. */
function bodyReactions(rows: ReportReactionRow[]): ReportReactionRow[] {
	return rows.filter((r) => r.commentId === null);
}

/** Groups comment-level reactions by their comment id. */
function reactionsByComment(
	rows: ReportReactionRow[],
): Map<string, ReportReactionRow[]> {
	const map = new Map<string, ReportReactionRow[]>();
	for (const row of rows) {
		if (!row.commentId) continue;
		const list = map.get(row.commentId);
		if (list) list.push(row);
		else map.set(row.commentId, [row]);
	}
	return map;
}

export const reportDiscussionRoutes = new Hono<AppEnv>()
	.get("/:id/discussion", async (c) => {
		const reportId = c.req.param("id");
		const { user } = requireScope(c, "read");
		// A participant (owner or Send-to recipient) reads the thread directly; an
		// admin who is neither still reads it under the report's read access
		// (matrix R/R*). Writes stay participant-only (requireParticipant).
		const access = await getReportDiscussionAccess(c.var.db, reportId, user.id);
		let shared: boolean;
		if (access) {
			shared = access.shared;
		} else {
			await requireReportReadAccess(c, reportId);
			shared = await isReportShared(c.var.db, reportId);
		}
		const [comments, reactions] = await Promise.all([
			listReportComments(c.var.db, reportId),
			listReportReactions(c.var.db, reportId),
		]);
		const byComment = reactionsByComment(reactions);
		// Resolve each author's live avatar in one batch (frozen author_user_id is
		// null once their account is deleted — those keep initials).
		const authorIds = [
			...new Set(
				comments
					.map((comment) => comment.authorUserId)
					.filter((id): id is string => id !== null),
			),
		];
		const authors = await listUsersByIds(c.var.db, authorIds);
		const imageById = new Map(authors.map((a) => [a.id, a.image]));
		return c.json({
			shared,
			reactions: toReactionSummaries(bodyReactions(reactions), user.id),
			comments: comments.map((comment) =>
				toApiComment(
					comment,
					byComment.get(comment.id) ?? [],
					user.id,
					comment.authorUserId
						? resolveAvatarUrl(
								comment.authorUserId,
								imageById.get(comment.authorUserId),
							)
						: null,
				),
			),
		});
	})
	.put("/:id/reactions", async (c) => {
		const reportId = c.req.param("id");
		const { user } = await requireParticipant(c, reportId, "write");
		const { emoji } = validate(toggleReactionInputSchema, await c.req.json());
		await toggleReportReaction(c.var.db, {
			reportId,
			commentId: null,
			userId: user.id,
			userName: user.name,
			emoji,
		});
		const reactions = await listReportReactions(c.var.db, reportId);
		publishToReportParticipants(c, reportId);
		return c.json(toReactionSummaries(bodyReactions(reactions), user.id));
	})
	.post("/:id/comments", async (c) => {
		const reportId = c.req.param("id");
		const { user } = await requireParticipant(c, reportId, "write");
		const { body } = validate(createCommentInputSchema, await c.req.json());
		const comment = await createReportComment(c.var.db, {
			reportId,
			authorUserId: user.id,
			authorName: user.name,
			authorEmail: user.email,
			body,
		});
		publishToReportParticipants(c, reportId);
		return c.json(toApiComment(comment, [], user.id, user.imageUrl), 201);
	})
	.patch("/:id/comments/:commentId", async (c) => {
		const reportId = c.req.param("id");
		const commentId = c.req.param("commentId");
		const { user } = await requireParticipant(c, reportId, "write");
		const { body } = validate(updateCommentInputSchema, await c.req.json());
		const updated = await updateReportComment(
			c.var.db,
			commentId,
			reportId,
			user.id,
			body,
		);
		// Missing, wrong report, or not the author — never reveal which.
		if (!updated) throw new AppError("not_found", "Comment not found");
		publishToReportParticipants(c, reportId);
		const reactions = await listReportReactions(c.var.db, reportId);
		const byComment = reactionsByComment(reactions);
		return c.json(
			toApiComment(
				updated,
				byComment.get(commentId) ?? [],
				user.id,
				user.imageUrl,
			),
		);
	})
	.delete("/:id/comments/:commentId", async (c) => {
		const reportId = c.req.param("id");
		const commentId = c.req.param("commentId");
		const { user } = await requireParticipant(c, reportId, "write");
		const deleted = await deleteReportComment(
			c.var.db,
			commentId,
			reportId,
			user.id,
		);
		if (!deleted) throw new AppError("not_found", "Comment not found");
		publishToReportParticipants(c, reportId);
		return c.body(null, 204);
	})
	.put("/:id/comments/:commentId/reactions", async (c) => {
		const reportId = c.req.param("id");
		const commentId = c.req.param("commentId");
		const { user } = await requireParticipant(c, reportId, "write");
		// Validate the comment belongs to this report so a reaction can't target
		// another report's comment.
		const comment = await getReportComment(c.var.db, commentId, reportId);
		if (!comment) throw new AppError("not_found", "Comment not found");
		const { emoji } = validate(toggleReactionInputSchema, await c.req.json());
		await toggleReportReaction(c.var.db, {
			reportId,
			commentId,
			userId: user.id,
			userName: user.name,
			emoji,
		});
		const reactions = await listReportReactions(c.var.db, reportId);
		const byComment = reactionsByComment(reactions);
		publishToReportParticipants(c, reportId);
		return c.json(toReactionSummaries(byComment.get(commentId) ?? [], user.id));
	});
