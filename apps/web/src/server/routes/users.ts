import {
	createUserInputSchema,
	type ManagedUser,
	updateUserInputSchema,
} from "@toxil/core";
import {
	countAdmins,
	deleteUser,
	findUserByEmail,
	getInstanceSettings,
	getUserById,
	listUsers,
	type UserRow,
	updateUser,
	userOwnsAnyWorkspace,
} from "@toxil/db";
import { Hono } from "hono";

import { createAccount } from "../lib/create-account";
import { AppError } from "../lib/errors";
import { generateTempPassword } from "../lib/password";
import { requireInstanceAdmin } from "../lib/permissions";
import { validate } from "../lib/validate";
import type { AppEnv } from "../types";

function toManagedUser(row: UserRow): ManagedUser {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		isAdmin: row.isAdmin ?? false,
		createdAt: row.createdAt.toISOString(),
	};
}

export const userRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireInstanceAdmin(c);
		const rows = await listUsers(c.var.db);
		return c.json(rows.map(toManagedUser));
	})
	.post("/", async (c) => {
		requireInstanceAdmin(c);
		const input = validate(createUserInputSchema, await c.req.json());

		// Direct creation is the email-off path; when delivery is on, onboarding
		// goes through invitations (mirrors the opposite gate on POST /invitations).
		const settings = await getInstanceSettings(c.var.db);
		if (settings?.emailEnabled) {
			throw new AppError(
				"forbidden",
				"Email delivery is enabled; invite the user instead",
			);
		}
		if (await findUserByEmail(c.var.db, input.email)) {
			throw new AppError("conflict", "A user with this email already exists");
		}

		// Email delivery off path: create immediately with a generated password
		// that is returned exactly once for the admin to convey out of band.
		const password = generateTempPassword();
		const userId = await createAccount(c, {
			email: input.email,
			name: input.name,
			password,
		});
		if (input.grantAdmin) {
			await updateUser(c.var.db, userId, { isAdmin: true });
		}

		const created = await getUserById(c.var.db, userId);
		if (!created) throw new AppError("internal", "User creation failed");
		return c.json(
			{ ...toManagedUser(created), generatedPassword: password },
			201,
		);
	})
	.patch("/:id", async (c) => {
		const { user: actor } = requireInstanceAdmin(c);
		const id = c.req.param("id");
		const input = validate(updateUserInputSchema, await c.req.json());

		const target = await getUserById(c.var.db, id);
		if (!target) throw new AppError("not_found", "User not found");

		// Demotion guards: never strip your own admin rights, and never remove the
		// last instance admin (which would lock everyone out of system management).
		if (input.isAdmin === false && (target.isAdmin ?? false)) {
			if (target.id === actor.id) {
				throw new AppError(
					"forbidden",
					"You cannot remove your own admin role",
				);
			}
			if ((await countAdmins(c.var.db)) <= 1) {
				throw new AppError(
					"forbidden",
					"Cannot remove the last instance admin",
				);
			}
		}

		const patch: Partial<Pick<UserRow, "name" | "isAdmin">> = {};
		if (input.name !== undefined) patch.name = input.name;
		if (input.isAdmin !== undefined) patch.isAdmin = input.isAdmin;
		const updated = await updateUser(c.var.db, id, patch);
		if (!updated) throw new AppError("not_found", "User not found");
		return c.json(toManagedUser(updated));
	})
	.delete("/:id", async (c) => {
		const { user: actor } = requireInstanceAdmin(c);
		const id = c.req.param("id");

		const target = await getUserById(c.var.db, id);
		if (!target) throw new AppError("not_found", "User not found");
		if (target.id === actor.id) {
			throw new AppError("forbidden", "You cannot delete your own account");
		}
		if ((target.isAdmin ?? false) && (await countAdmins(c.var.db)) <= 1) {
			throw new AppError("forbidden", "Cannot remove the last instance admin");
		}
		// Deleting a user cascades their workspace memberships, which would orphan
		// any workspace they own. Require the workspace to be handled first.
		if (await userOwnsAnyWorkspace(c.var.db, id)) {
			throw new AppError(
				"conflict",
				"This user owns a workspace; reassign or delete the workspace first",
			);
		}

		await deleteUser(c.var.db, id);
		return c.body(null, 204);
	});
