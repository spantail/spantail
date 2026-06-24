import { addWorkspaceMemberInputSchema } from "@spantail/core";
import {
	addMember,
	findUserByEmail,
	getMembership,
	listMembers,
	removeMember,
} from "@spantail/db";
import { Hono } from "hono";

import { resolveAvatarUrl } from "../lib/avatar";
import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

/** Maps a member row to the API shape, resolving the avatar URL. */
function toApiMember<T extends { userId: string; image: string | null }>(
	row: T,
) {
	const { image, ...rest } = row;
	return { ...rest, imageUrl: resolveAvatarUrl(row.userId, image) };
}

export const memberRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId);
		const members = await listMembers(c.var.db, workspaceId);
		return c.json(members.map(toApiMember));
	})
	.post("/", async (c) => {
		requireScope(c, "admin");
		const workspaceId = c.req.param("id") ?? "";
		await requireWorkspaceAccess(c, workspaceId, "admin");
		const input = validate(addWorkspaceMemberInputSchema, await c.req.json());

		const target = await findUserByEmail(c.var.db, input.email);
		if (!target) {
			throw new AppError("not_found", "No registered user with this email");
		}
		if (await getMembership(c.var.db, workspaceId, target.id)) {
			throw new AppError(
				"conflict",
				"User is already a member of this workspace",
			);
		}
		await addMember(c.var.db, {
			workspaceId,
			userId: target.id,
			role: input.role,
		});
		const members = await listMembers(c.var.db, workspaceId);
		const added = members.find((m) => m.userId === target.id);
		return c.json(added ? toApiMember(added) : undefined, 201);
	})
	.delete("/:userId", async (c) => {
		requireScope(c, "admin");
		const workspaceId = c.req.param("id") ?? "";
		const userId = c.req.param("userId");
		await requireWorkspaceAccess(c, workspaceId, "admin");

		const target = await getMembership(c.var.db, workspaceId, userId);
		if (!target) throw new AppError("not_found", "Member not found");
		if (target.role === "owner") {
			throw new AppError("forbidden", "The workspace owner cannot be removed");
		}
		await removeMember(c.var.db, workspaceId, userId);
		return c.body(null, 204);
	});
