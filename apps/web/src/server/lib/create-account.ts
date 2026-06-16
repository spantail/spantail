import { APIError } from "better-auth/api";
import type { Context } from "hono";

import { createAuth } from "../auth";
import type { AppEnv } from "../types";
import { AppError } from "./errors";

/**
 * Creates a user account through Better Auth (reusing its password hashing and
 * credential-account linking) and returns the new user id. Callers grant admin
 * rights afterward via updateUser, since the isAdmin field is input: false.
 */
export async function createAccount(
	c: Context<AppEnv>,
	input: { email: string; name: string; password: string },
): Promise<string> {
	const auth = createAuth(c.env, c.var.db);
	try {
		const result = await auth.api.signUpEmail({
			body: {
				email: input.email,
				name: input.name,
				password: input.password,
			},
		});
		return result.user.id;
	} catch (error) {
		if (error instanceof APIError) {
			throw new AppError("conflict", "A user with this email already exists");
		}
		throw error;
	}
}
