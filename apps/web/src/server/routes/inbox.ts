import { listInboxQuerySchema, setMailFlagsInputSchema } from "@spantail/core";
import {
	countFolders,
	countUnreadInbox,
	getDeliveryDetailById,
	getInboxMessage,
	getMailItemDetail,
	listDeliveriesByWorkspace,
	listMailbox,
	markAllInboxRead,
	markInboxRead,
	markInboxUnread,
	setDeliveryFlags,
	userOwnsMailTarget,
} from "@spantail/db";
import { Hono } from "hono";

import { resolveAvatarUrl } from "../lib/avatar";
import { AppError } from "../lib/errors";
import { parseOptionalJsonBody } from "../lib/json";
import { resolveAdminListScope } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";
import { requireReportReadAccess } from "./reports";

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
			return c.json(
				await listDeliveriesByWorkspace(
					c.var.db,
					scope.workspaceId,
					limit,
					offset,
				),
			);
		}
		const userId = scope.kind === "user" ? scope.ownerUserId : scope.userId;
		// Date timestamps + boolean flags serialize straight to the API shape.
		const rows = await listMailbox(c.var.db, userId, folder, limit, offset);
		return c.json(rows);
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
		return c.body(null, 204);
	})
	.get("/:id", async (c) => {
		const { user } = requireScope(c, "read");
		const id = c.req.param("id");
		const detail = await getMailItemDetail(c.var.db, id, user.id);
		if (detail) {
			if (detail.scope === "sent") {
				return c.json({
					...detail,
					recipients: detail.recipients.map(({ image, ...r }) => ({
						...r,
						imageUrl: resolveAvatarUrl(r.id, image),
					})),
				});
			}
			return c.json(detail);
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
		return c.json(adminDetail);
	})
	.post("/:id/read", async (c) => {
		const { user } = requireScope(c, "write");
		const row = await getInboxMessage(c.var.db, c.req.param("id"), user.id);
		if (!row) throw new AppError("not_found", "Message not found");
		await markInboxRead(c.var.db, row.id, user.id);
		return c.body(null, 204);
	})
	.post("/:id/unread", async (c) => {
		const { user } = requireScope(c, "write");
		const row = await getInboxMessage(c.var.db, c.req.param("id"), user.id);
		if (!row) throw new AppError("not_found", "Message not found");
		await markInboxUnread(c.var.db, row.id, user.id);
		return c.body(null, 204);
	});
