import type { WorkspaceRole } from "@toxil/core";
import {
	getMembership,
	getWorkspaceById,
	type MembershipRow,
	type WorkspaceRow,
} from "@toxil/db";
import type { Context } from "hono";

import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import { AppError } from "./errors";

const ROLE_RANK: Record<WorkspaceRole, number> = {
	member: 0,
	admin: 1,
	owner: 2,
};

/**
 * Asserts the current user is a member of the workspace with at least
 * `minRole`. Non-members get 404 (existence is not revealed); members with an
 * insufficient role get 403.
 */
export async function requireWorkspaceAccess(
	c: Context<AppEnv>,
	workspaceId: string,
	minRole: WorkspaceRole = "member",
): Promise<{ workspace: WorkspaceRow; membership: MembershipRow }> {
	const { user } = requireAuth(c);
	const workspace = await getWorkspaceById(c.var.db, workspaceId);
	const membership = workspace
		? await getMembership(c.var.db, workspaceId, user.id)
		: undefined;
	if (!workspace || !membership) {
		throw new AppError("not_found", "Workspace not found");
	}
	if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
		throw new AppError("forbidden", `Requires workspace ${minRole} role`);
	}
	return { workspace, membership };
}
