import type { WorkspaceRole } from "@toxil/core";
import {
	getMembership,
	getWorkspaceById,
	listWorkspacesForUser,
	type MembershipRow,
	type WorkspaceRow,
} from "@toxil/db";
import type { Context } from "hono";

import { requireAuth, requireScope } from "../middleware/auth";
import type { AppEnv, AuthContext } from "../types";
import { AppError } from "./errors";

const ROLE_RANK: Record<WorkspaceRole, number> = {
	member: 0,
	admin: 1,
	owner: 2,
};

/**
 * Asserts the caller is an instance admin (the system-wide super admin).
 * PAT callers must also hold the "admin" scope. Used by the system-wide user
 * management, invitation, and instance-settings endpoints.
 */
export function requireInstanceAdmin(c: Context<AppEnv>): AuthContext {
	const auth = requireScope(c, "admin");
	if (!auth.user.isAdmin) {
		throw new AppError("forbidden", "Requires instance admin");
	}
	return auth;
}

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

export type MemberWorkspace = Awaited<
	ReturnType<typeof listWorkspacesForUser>
>[number];

/**
 * Asserts every workspace id is within the union of the current user's
 * memberships and returns those memberships. Used for report scopes at
 * create/update/run time and re-checked when reading rendered snapshots,
 * so removal from a workspace also cuts access to its frozen report data.
 */
export async function requireScopeWorkspaces(
	c: Context<AppEnv>,
	workspaceIds: string[],
): Promise<MemberWorkspace[]> {
	const { user } = requireAuth(c);
	const workspaces = await listWorkspacesForUser(c.var.db, user.id);
	const memberIds = new Set(workspaces.map((w) => w.id));
	for (const workspaceId of workspaceIds) {
		if (!memberIds.has(workspaceId)) {
			throw new AppError(
				"forbidden",
				"Report scope includes a workspace outside your memberships",
			);
		}
	}
	return workspaces;
}
