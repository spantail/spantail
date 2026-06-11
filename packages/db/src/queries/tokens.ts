import { and, eq } from "drizzle-orm";

import type { Database } from "../index";
import { apiTokens } from "../schema/tokens";

export type ApiTokenRow = typeof apiTokens.$inferSelect;

export async function createApiToken(
	db: Database,
	input: {
		userId: string;
		name: string;
		tokenHash: string;
		scopes: ApiTokenRow["scopes"];
		expiresAt: Date | null;
	},
): Promise<ApiTokenRow> {
	const rows = await db
		.insert(apiTokens)
		.values({ id: crypto.randomUUID(), ...input })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("api token insert returned no row");
	return row;
}

export async function listApiTokensForUser(
	db: Database,
	userId: string,
): Promise<ApiTokenRow[]> {
	return db
		.select()
		.from(apiTokens)
		.where(eq(apiTokens.userId, userId))
		.orderBy(apiTokens.createdAt);
}

export async function findApiTokenByHash(
	db: Database,
	tokenHash: string,
): Promise<ApiTokenRow | undefined> {
	return db
		.select()
		.from(apiTokens)
		.where(eq(apiTokens.tokenHash, tokenHash))
		.get();
}

export async function deleteApiToken(
	db: Database,
	userId: string,
	id: string,
): Promise<boolean> {
	const rows = await db
		.delete(apiTokens)
		.where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
		.returning({ id: apiTokens.id });
	return rows.length > 0;
}

export async function touchApiToken(db: Database, id: string): Promise<void> {
	await db
		.update(apiTokens)
		.set({ lastUsedAt: new Date() })
		.where(eq(apiTokens.id, id));
}
