import {
	createReportShareInputSchema,
	generateShareToken,
	listInboxQuerySchema,
	setMailFlagsInputSchema,
} from "@spantail/core";
import {
	countFolders,
	countUnreadInbox,
	createReportShare,
	getDeliveryDetailById,
	getInboxMessage,
	getMailItemDetail,
	listDeliveriesByWorkspace,
	listMailbox,
	listReportSharesByContent,
	type MailItemRow,
	markAllInboxRead,
	markInboxRead,
	markInboxUnread,
	type ReportDeliveryRow,
	resolveDeliveredContentId,
	setDeliveryFlags,
	userOwnsMailTarget,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { resolveAvatarUrl } from "../lib/avatar";
import { AppError } from "../lib/errors";
import { parseOptionalJsonBody } from "../lib/json";
import { resolveAdminListScope } from "../lib/permissions";
import { shareAttributesFromInput, toApiShare } from "../lib/share-api";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import { publishToUser } from "../realtime/publish";
import type { AppEnv } from "../types";
import { requireReportReadAccess } from "./reports";

// Resolves a row's raw avatar fields into ready-to-use URLs and drops the raw
// ones, producing the wire `MailItem` shape. Received rows carry the sender's
// image; sent rows carry per-recipient images aligned with recipientNames.
function toMailItem(row: MailItemRow) {
	const { senderUserId, senderImage, recipientIds, recipientImages, ...rest } =
		row;
	return {
		...rest,
		senderImageUrl: senderUserId
			? resolveAvatarUrl(senderUserId, senderImage)
			: null,
		recipientImageUrls: rest.recipientNames.map((_, i) => {
			const id = recipientIds[i];
			return id ? resolveAvatarUrl(id, recipientImages[i]) : null;
		}),
	};
}

// Every delivery records the content version it carried; a rollout-window row
// (inserted by a pre-column Worker after the migration backfill) is resolved
// and repaired by resolveDeliveredContentId. A null after that is a server
// bug, not a caller error.
async function deliveredContentId(
	c: Context<AppEnv>,
	row: ReportDeliveryRow,
): Promise<string> {
	const contentId = await resolveDeliveredContentId(c.var.db, row);
	if (!contentId) {
		throw new AppError("internal", "Delivery content missing");
	}
	return contentId;
}

// The recipient-scoped delivery row, or 404. Backs the share routes: only the
// recipient of a received copy (sent-scope items and other users get the same
// 404) can mint or list share links on it.
async function requireReceivedMessage(
	c: Context<AppEnv>,
	id: string,
	userId: string,
): Promise<ReportDeliveryRow> {
	const row = await getInboxMessage(c.var.db, id, userId);
	if (!row) throw new AppError("not_found", "Message not found");
	return row;
}

// The caller's mailbox of report deliveries (the "Send to" target). Folders are
// server-side filters over the caller's own deliveries; every route is scoped to
// the caller, so no one can read or mutate another mailbox.
export const inboxRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		// Admin reads are addressed by ?ownerUserId (instance admin reads a user's
		// mailbox, R) or ?workspaceId (workspace admin, R* — deliveries of the
		// workspace's single-workspace reports across recipients); otherwise the
		// caller reads their own mailbox.
		const scope = await resolveAdminListScope(c, {
			ownerUserId: c.req.query("ownerUserId"),
			workspaceId: c.req.query("workspaceId"),
		});
		const { folder, limit, offset } = validate(
			listInboxQuerySchema,
			c.req.query(),
		);
		if (scope.kind === "workspace") {
			// Cross-recipient view: folders are per-recipient mailbox state and do
			// not apply here, so an explicit non-default folder is rejected rather
			// than silently ignored (it would return the unfiltered list).
			if (c.req.query("folder") !== undefined && folder !== "inbox") {
				throw new AppError(
					"bad_request",
					"Folder filtering does not apply to a workspace-scoped delivery view",
				);
			}
			const wsRows = await listDeliveriesByWorkspace(
				c.var.db,
				scope.workspaceId,
				limit,
				offset,
			);
			return c.json(wsRows.map(toMailItem));
		}
		const userId = scope.kind === "user" ? scope.ownerUserId : scope.userId;
		// Date timestamps + boolean flags serialize straight to the API shape;
		// toMailItem resolves the raw avatar fields into URLs.
		const rows = await listMailbox(c.var.db, userId, folder, limit, offset);
		return c.json(rows.map(toMailItem));
	})
	// Static segments registered before "/:id" so they never match it.
	.get("/counts", async (c) => {
		const { user } = requireScope(c, "read");
		const counts = await countFolders(c.var.db, user.id);
		return c.json(counts);
	})
	.get("/unread-count", async (c) => {
		const { user } = requireScope(c, "read");
		const count = await countUnreadInbox(c.var.db, user.id);
		return c.json({ count });
	})
	.post("/read-all", async (c) => {
		const { user } = requireScope(c, "write");
		await markAllInboxRead(c.var.db, user.id);
		publishToUser(c, user.id, { type: "message" });
		return c.body(null, 204);
	})
	// Upsert the caller's flags on a received message or a sent batch. The query
	// layer rejects targets the caller doesn't own.
	.patch("/flags", async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(
			setMailFlagsInputSchema,
			await parseOptionalJsonBody(c),
		);
		const owns = await userOwnsMailTarget(
			c.var.db,
			user.id,
			input.scope,
			input.targetId,
		);
		if (!owns) throw new AppError("not_found", "Message not found");
		await setDeliveryFlags(
			c.var.db,
			{ userId: user.id, scope: input.scope, targetId: input.targetId },
			{
				starred: input.starred,
				archived: input.archived,
				trashed: input.trashed,
			},
		);
		publishToUser(c, user.id, { type: "message" });
		return c.body(null, 204);
	})
	.get("/:id", async (c) => {
		const { user } = requireScope(c, "read");
		const id = c.req.param("id");
		const detail = await getMailItemDetail(c.var.db, id, user.id);
		if (detail) {
			if (detail.scope === "sent") {
				return c.json({
					...toMailItem(detail),
					recipients: detail.recipients.map(({ image, ...r }) => ({
						...r,
						imageUrl: resolveAvatarUrl(r.id, image),
					})),
				});
			}
			return c.json(toMailItem(detail));
		}
		// Not the caller's own mail — admins may still read it (matrix R/R*) as a
		// received-detail view. Instance admins read any delivery; a workspace admin
		// reads it through the source report's read access (single-workspace only).
		const adminDetail = await getDeliveryDetailById(c.var.db, id);
		if (!adminDetail) throw new AppError("not_found", "Message not found");
		if (!user.isAdmin) {
			if (!adminDetail.reportId) {
				throw new AppError("not_found", "Message not found");
			}
			await requireReportReadAccess(c, adminDetail.reportId);
		}
		return c.json(toMailItem(adminDetail));
	})
	// Public share links over a received copy. The email model applies: the
	// delivered version is the recipient's to re-share (they can already
	// download or print it), so minting re-checks no workspace membership —
	// the sender's recipient validation at send time was the dissemination
	// gate. Links reference the delivered content version, so they serve
	// exactly what was received, and revocation stays with the recipient (the
	// creator) via POST /api/v1/report-shares/:id/revoke.
	.post("/:id/shares", async (c) => {
		const { user } = requireScope(c, "write");
		const row = await requireReceivedMessage(c, c.req.param("id"), user.id);
		const input = validate(
			createReportShareInputSchema,
			await parseOptionalJsonBody(c),
		);
		const share = await createReportShare(c.var.db, {
			reportContentId: await deliveredContentId(c, row),
			createdByUserId: user.id,
			token: generateShareToken(),
			...(await shareAttributesFromInput(input)),
		});
		return c.json(toApiShare(share), 201);
	})
	// Only the caller's own links on this delivery's version: links the report
	// owner (or another recipient of the same version) minted are theirs, not
	// part of this mailbox view.
	.get("/:id/shares", async (c) => {
		const { user } = requireScope(c, "read");
		const row = await requireReceivedMessage(c, c.req.param("id"), user.id);
		const shares = await listReportSharesByContent(
			c.var.db,
			await deliveredContentId(c, row),
			user.id,
		);
		return c.json(shares.map(toApiShare));
	})
	.post("/:id/read", async (c) => {
		const { user } = requireScope(c, "write");
		const row = await getInboxMessage(c.var.db, c.req.param("id"), user.id);
		if (!row) throw new AppError("not_found", "Message not found");
		await markInboxRead(c.var.db, row.id, user.id);
		publishToUser(c, user.id, { type: "message" });
		return c.body(null, 204);
	})
	.post("/:id/unread", async (c) => {
		const { user } = requireScope(c, "write");
		const row = await getInboxMessage(c.var.db, c.req.param("id"), user.id);
		if (!row) throw new AppError("not_found", "Message not found");
		await markInboxUnread(c.var.db, row.id, user.id);
		publishToUser(c, user.id, { type: "message" });
		return c.body(null, 204);
	});
