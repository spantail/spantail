import {
	countUnreadInbox,
	deleteInboxMessage,
	getInboxMessage,
	listInboxForUser,
	markAllInboxRead,
	markInboxRead,
} from "@toxil/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { toApiInbox, toApiInboxDetail } from "../lib/inbox-api";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

// The recipient's own inbox of report deliveries (the "Send to" target). Every
// route is scoped to the caller, so no one can read or mutate another inbox.
export const inboxRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const { user } = requireScope(c, "read");
		const rows = await listInboxForUser(c.var.db, user.id);
		return c.json(rows.map(toApiInbox));
	})
	// Static segment registered before "/:id" so the badge count never matches it.
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
	.get("/:id", async (c) => {
		const { user } = requireScope(c, "read");
		const row = await getInboxMessage(c.var.db, c.req.param("id"), user.id);
		if (!row) throw new AppError("not_found", "Message not found");
		return c.json(toApiInboxDetail(row));
	})
	.post("/:id/read", async (c) => {
		const { user } = requireScope(c, "write");
		const row = await getInboxMessage(c.var.db, c.req.param("id"), user.id);
		if (!row) throw new AppError("not_found", "Message not found");
		await markInboxRead(c.var.db, row.id, user.id);
		return c.body(null, 204);
	})
	.delete("/:id", async (c) => {
		const { user } = requireScope(c, "write");
		const row = await getInboxMessage(c.var.db, c.req.param("id"), user.id);
		if (!row) throw new AppError("not_found", "Message not found");
		await deleteInboxMessage(c.var.db, row.id, user.id);
		return c.body(null, 204);
	});
