import { listInboxQuerySchema, setMailFlagsInputSchema } from "@toxil/core";
import {
	countFolders,
	countUnreadInbox,
	getInboxMessage,
	getMailItemDetail,
	listMailbox,
	markAllInboxRead,
	markInboxRead,
	markInboxUnread,
	setDeliveryFlags,
	userOwnsMailTarget,
} from "@toxil/db";
import { Hono } from "hono";

import { resolveAvatarUrl } from "../lib/avatar";
import { AppError } from "../lib/errors";
import { parseOptionalJsonBody } from "../lib/json";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

// The caller's mailbox of report deliveries (the "Send to" target). Folders are
// server-side filters over the caller's own deliveries; every route is scoped to
// the caller, so no one can read or mutate another mailbox.
export const inboxRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const { user } = requireScope(c, "read");
		const { folder, limit, offset } = validate(
			listInboxQuerySchema,
			c.req.query(),
		);
		// Date timestamps + boolean flags serialize straight to the API shape.
		const rows = await listMailbox(c.var.db, user.id, folder, limit, offset);
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
		const detail = await getMailItemDetail(
			c.var.db,
			c.req.param("id"),
			user.id,
		);
		if (!detail) throw new AppError("not_found", "Message not found");
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
