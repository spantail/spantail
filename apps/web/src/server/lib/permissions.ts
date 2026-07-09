import type { WorkspaceRole } from "@spantail/core";
import {
	type Database,
	type EntryAccessScope,
	getMembership,
	getWorkspaceById,
	isProjectMember,
	listAllWorkspaces,
	listWorkspacesForUser,
	type MembershipRow,
	type WorkspaceRow,
} from "@spantail/db";
import type { Context } from "hono";

import { requireAuth, requireScope } from "../middleware/auth";
import type { AgentAuthContext, AppEnv, UserAuthContext } from "../types";
import { AppError } from "./errors";

/** Workspace admins/owners read every project; members are scoped by ACL. */
export function isWorkspaceAdmin(role: WorkspaceRole): boolean {
	return role === "owner" || role === "admin";
}

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
export function requireInstanceAdmin(c: Context<AppEnv>): UserAuthContext {
	const auth = requireScope(c, "admin");
	if (!auth.user.isAdmin) {
		throw new AppError("forbidden", "Requires instance admin");
	}
	return auth;
}

/**
 * Asserts the caller may manage instance-wide report templates: either a full
 * instance admin or a user granted the template-author capability. PAT callers
 * must also hold the "write" scope. Templates are instance-scoped formats, so
 * authoring is not tied to any workspace role.
 */
export function requireTemplateManager(c: Context<AppEnv>): UserAuthContext {
	const auth = requireScope(c, "write");
	if (!auth.user.isAdmin && !auth.user.canManageTemplates) {
		throw new AppError("forbidden", "Requires template management permission");
	}
	return auth;
}

/**
 * Asserts the current user may act on the workspace with at least `minRole`.
 * Members are checked against their stored role; non-members get 404 (existence
 * is not revealed) and members with an insufficient role get 403.
 *
 * Instance admins bypass membership (Principle 1 in docs/permissions.md): they
 * read and write workspace/project containers without belonging to the
 * workspace, and satisfy any `minRole` regardless of an incidental stored
 * role. The bypass returns a synthetic `admin` membership so every call site
 * behaves as if the admin were a workspace admin — an incidental `member` row
 * does not demote it, and an `owner` row is not lowered. A missing workspace is
 * still 404 for everyone, including admins.
 *
 * Pass `{ write: true }` from routes that mutate workspace-scoped data: an
 * archived workspace is read-only, so those requests are rejected with 409.
 * The exceptions — unarchiving (PATCH `archived`) and deleting the workspace —
 * stay in read mode.
 */
export async function requireWorkspaceAccess(
	c: Context<AppEnv>,
	workspaceId: string,
	minRole: WorkspaceRole = "member",
	opts: { write?: boolean } = {},
): Promise<{ workspace: WorkspaceRow; membership: MembershipRow }> {
	const { user } = requireAuth(c);
	const workspace = await getWorkspaceById(c.var.db, workspaceId);
	if (!workspace) {
		throw new AppError("not_found", "Workspace not found");
	}
	let membership = await getMembership(c.var.db, workspaceId, user.id);
	if (user.isAdmin) {
		membership = {
			workspaceId,
			userId: user.id,
			role: membership?.role === "owner" ? "owner" : "admin",
			createdAt: membership?.createdAt ?? workspace.createdAt,
		};
	} else if (!membership) {
		throw new AppError("not_found", "Workspace not found");
	} else if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
		throw new AppError("forbidden", `Requires workspace ${minRole} role`);
	}
	if (opts.write && workspace.archivedAt) {
		throw new AppError("conflict", "Workspace is archived");
	}
	return { workspace, membership };
}

/**
 * Resolves and authorizes the workspace an agent ingest targets: the explicit
 * input workspace, or the token's default binding when omitted. Live
 * delegation check — the agent may only write where its owner is currently a
 * member, even if the token was bound earlier. No instance-admin bypass:
 * ingest always acts as the owner, never as an admin. Ingest is always a
 * write, so an archived workspace rejects it.
 */
export async function requireAgentIngestWorkspace(
	c: Context<AppEnv>,
	auth: AgentAuthContext,
	inputWorkspaceId: string | undefined,
): Promise<{ workspaceId: string; membership: MembershipRow }> {
	const workspaceId = inputWorkspaceId ?? auth.defaultWorkspaceId;
	if (!workspaceId) {
		throw new AppError(
			"bad_request",
			"No workspace: provide workspaceId or bind a default to the token",
		);
	}
	const workspace = await getWorkspaceById(c.var.db, workspaceId);
	const membership = workspace
		? await getMembership(c.var.db, workspaceId, auth.ownerUserId)
		: undefined;
	if (!workspace || !membership) {
		throw new AppError(
			"forbidden",
			"The agent's owner is not a member of this workspace",
		);
	}
	if (workspace.archivedAt) {
		throw new AppError("conflict", "Workspace is archived");
	}
	return { workspaceId, membership };
}

/**
 * Lists the workspaces a caller may see. Plain users get the workspaces they
 * belong to; instance admins get every workspace (Principle 1), with `role`
 * `null` for the ones they are not a member of so the SPA can blank the
 * workspace-scoped sidebar. Used by the `/me` and `/workspaces` collection
 * endpoints.
 */
export async function listVisibleWorkspaces(
	db: Database,
	user: { id: string; isAdmin: boolean },
): Promise<Array<WorkspaceRow & { role: MembershipRow["role"] | null }>> {
	return user.isAdmin
		? listAllWorkspaces(db, user.id)
		: listWorkspacesForUser(db, user.id);
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

/**
 * Resolves what project-scoped entries the caller may read in a single
 * workspace. A workspace admin/owner reads every project; a plain member is
 * limited to the projects they belong to (checked in-SQL), plus unassigned and
 * their own entries. Pass the result to the entry queries' `access` option.
 */
export function resolveEntryAccess(
	workspaceId: string,
	membership: MembershipRow,
	userId: string,
): EntryAccessScope {
	return {
		adminWorkspaceIds: isWorkspaceAdmin(membership.role) ? [workspaceId] : [],
		userId,
	};
}

/**
 * Resolves entry-read access across several workspaces (report scope, search):
 * the workspaces where the caller is an admin grant full read; elsewhere
 * project membership (checked in-SQL) and own entries apply. An instance admin
 * reads every workspace passed in (Principle 1), including ones they only hold
 * a `member` row in, or none at all (`role: null`).
 */
export function resolveEntryAccessForWorkspaces(
	workspaces: Array<{ id: string; role: WorkspaceRole | null }>,
	user: { id: string; isAdmin: boolean },
): EntryAccessScope {
	return {
		adminWorkspaceIds: workspaces
			.filter((w) => user.isAdmin || (w.role && isWorkspaceAdmin(w.role)))
			.map((w) => w.id),
		userId: user.id,
	};
}

/**
 * Asserts the caller may write entries against a project: workspace admins/owners
 * always may; otherwise the caller must be a member of the project. Used when an
 * entry is assigned to a project so a non-member cannot log into (and then be
 * unable to read) a project they do not belong to.
 */
export async function requireProjectAccess(
	c: Context<AppEnv>,
	projectId: string,
	membership: MembershipRow,
	userId: string,
): Promise<void> {
	if (isWorkspaceAdmin(membership.role)) return;
	if (!(await isProjectMember(c.var.db, projectId, userId))) {
		throw new AppError("forbidden", "You are not a member of this project");
	}
}

/**
 * Which slice of a user-scoped collection an admin read addresses, and who is
 * authorized for it. See docs/permissions.md (Access matrix): an admin read of
 * another user's resources is addressed either by user (`?ownerUserId`, the
 * instance admin's full `R`) or by workspace (`?workspaceId`, a workspace
 * admin's scoped `R*`).
 */
export type AdminListScope =
	| { kind: "own"; userId: string }
	| { kind: "user"; ownerUserId: string }
	| { kind: "workspace"; workspaceId: string };

/**
 * Authorizes and classifies a collection read that supports admin scoping:
 *  - `?ownerUserId` → instance admin reads that user's resources (`R`),
 *  - `?workspaceId` → workspace admin reads that workspace's data (`R*`; an
 *    instance admin reaches it too via the membership bypass),
 *  - neither → the caller reads their own (`read` scope).
 * Each admin branch uses the scope-based guards (not `requireSession`) so the
 * reads are reachable over PAT/MCP, while a resource's own-list keeps its
 * existing middleware at the call site.
 */
export async function resolveAdminListScope(
	c: Context<AppEnv>,
	params: { ownerUserId?: string; workspaceId?: string },
): Promise<AdminListScope> {
	if (params.ownerUserId) {
		requireInstanceAdmin(c);
		return { kind: "user", ownerUserId: params.ownerUserId };
	}
	if (params.workspaceId) {
		// A workspace-scoped read still needs the "read" scope (PAT callers),
		// matching every other workspace read; requireWorkspaceAccess itself only
		// checks membership/role, not the token scope.
		requireScope(c, "read");
		await requireWorkspaceAccess(c, params.workspaceId, "admin");
		return { kind: "workspace", workspaceId: params.workspaceId };
	}
	const { user } = requireScope(c, "read");
	return { kind: "own", userId: user.id };
}
