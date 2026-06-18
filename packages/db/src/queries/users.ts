import { type OauthProvider, oauthProviderSchema } from "@toxil/core";
import { count, eq, inArray } from "drizzle-orm";

import type { Database } from "../index";
import { account, user } from "../schema/auth";

export type UserRow = typeof user.$inferSelect;

export async function countUsers(db: Database): Promise<number> {
	const rows = await db.select({ value: count() }).from(user);
	return rows[0]?.value ?? 0;
}

/** Number of instance admins; used to block removing the last one. */
export async function countAdmins(db: Database): Promise<number> {
	const rows = await db
		.select({ value: count() })
		.from(user)
		.where(eq(user.isAdmin, true));
	return rows[0]?.value ?? 0;
}

export async function findUserByEmail(
	db: Database,
	email: string,
): Promise<UserRow | undefined> {
	return db.select().from(user).where(eq(user.email, email)).get();
}

export async function getUserById(
	db: Database,
	id: string,
): Promise<UserRow | undefined> {
	return db.select().from(user).where(eq(user.id, id)).get();
}

export async function listUsersByIds(
	db: Database,
	ids: string[],
): Promise<UserRow[]> {
	if (ids.length === 0) return [];
	return db.select().from(user).where(inArray(user.id, ids));
}

export async function listUsers(db: Database): Promise<UserRow[]> {
	return db.select().from(user).orderBy(user.createdAt);
}

/**
 * Social login providers linked per user, keyed by user id. Only OAuth
 * providers are reported (the `credential`/password account is ignored), so a
 * password-only user is simply absent from the map. Used by the admin user
 * list to show how each user signs in.
 */
export async function listOauthProvidersByUser(
	db: Database,
): Promise<Map<string, OauthProvider[]>> {
	const rows = await db
		.select({ userId: account.userId, providerId: account.providerId })
		.from(account);
	const byUser = new Map<string, OauthProvider[]>();
	for (const row of rows) {
		const parsed = oauthProviderSchema.safeParse(row.providerId);
		if (!parsed.success) continue;
		const list = byUser.get(row.userId);
		if (list) list.push(parsed.data);
		else byUser.set(row.userId, [parsed.data]);
	}
	return byUser;
}

export async function updateUser(
	db: Database,
	id: string,
	patch: Partial<Pick<UserRow, "name" | "isAdmin" | "emailVerified">>,
): Promise<UserRow | undefined> {
	const rows = await db
		.update(user)
		.set(patch)
		.where(eq(user.id, id))
		.returning();
	return rows[0];
}

export async function deleteUser(db: Database, id: string): Promise<boolean> {
	const rows = await db
		.delete(user)
		.where(eq(user.id, id))
		.returning({ id: user.id });
	return rows.length > 0;
}
