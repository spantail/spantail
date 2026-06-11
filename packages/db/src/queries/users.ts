import { count, eq } from "drizzle-orm";

import type { Database } from "../index";
import { user } from "../schema/auth";

export type UserRow = typeof user.$inferSelect;

export async function countUsers(db: Database): Promise<number> {
	const rows = await db.select({ value: count() }).from(user);
	return rows[0]?.value ?? 0;
}

export async function findUserByEmail(
	db: Database,
	email: string,
): Promise<UserRow | undefined> {
	return db.select().from(user).where(eq(user.email, email)).get();
}
