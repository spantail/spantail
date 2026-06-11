import { count } from "drizzle-orm";

import type { Database } from "../index";
import { user } from "../schema/auth";

export async function countUsers(db: Database): Promise<number> {
	const rows = await db.select({ value: count() }).from(user);
	return rows[0]?.value ?? 0;
}
