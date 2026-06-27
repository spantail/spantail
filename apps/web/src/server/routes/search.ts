import { searchQuerySchema } from "@spantail/core";
import { searchReports, searchWorkEntries } from "@spantail/db";
import { Hono } from "hono";

import { isWorkspaceAdmin, listVisibleWorkspaces } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

/**
 * Global top-bar search. Lexical (LIKE) match across the caller's visible work
 * entries and own reports, grouped by type. Work-entry results are bounded to
 * visible workspaces and refined by the project ACL; report results are
 * owner-scoped. See packages/db/src/queries/search.ts for the predicates.
 */
export const searchRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const { user } = requireScope(c, "read");
	const { q } = validate(searchQuerySchema, c.req.query());

	const workspaces = await listVisibleWorkspaces(c.var.db, user);
	const workspaceIds = workspaces.map((w) => w.id);
	// Instance admins read every entry in their visible workspaces; otherwise the
	// ACL grants full read only where the caller is a workspace admin.
	const adminWorkspaceIds = user.isAdmin
		? workspaceIds
		: workspaces
				.filter((w) => w.role && isWorkspaceAdmin(w.role))
				.map((w) => w.id);

	const [workEntries, reports] = await Promise.all([
		searchWorkEntries(c.var.db, {
			term: q,
			workspaceIds,
			access: { adminWorkspaceIds, userId: user.id },
		}),
		searchReports(c.var.db, { term: q, ownerUserId: user.id }),
	]);

	return c.json({ workEntries, reports });
});
