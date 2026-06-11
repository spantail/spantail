import { listWorkspacesForUser } from "@toxil/db";
import { Hono } from "hono";

import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

export const meRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const { user } = requireScope(c, "read");
	const memberships = await listWorkspacesForUser(c.var.db, user.id);
	return c.json({ user, memberships });
});
