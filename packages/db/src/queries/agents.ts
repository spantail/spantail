import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import type { Database } from "../index";
import { agentEntries, agents, agentTokens } from "../schema/agents";

export type AgentRow = typeof agents.$inferSelect;
export type AgentTokenRow = typeof agentTokens.$inferSelect;
export type AgentEntryRow = typeof agentEntries.$inferSelect;
export type AgentEntryUpsert = Omit<
	typeof agentEntries.$inferInsert,
	"id" | "createdAt" | "updatedAt"
>;

// --- agents (account-scoped registry) ---

export async function createAgent(
	db: Database,
	values: { userId: string; type: AgentRow["type"]; name: string },
): Promise<AgentRow> {
	const rows = await db
		.insert(agents)
		.values({ id: crypto.randomUUID(), ...values })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("agent insert returned no row");
	return row;
}

/** Active (non-archived) agents owned by the user, newest first. */
export async function listAgentsForUser(
	db: Database,
	userId: string,
): Promise<AgentRow[]> {
	return db
		.select()
		.from(agents)
		.where(and(eq(agents.userId, userId), isNull(agents.archivedAt)))
		.orderBy(desc(agents.createdAt));
}

export async function getAgentById(
	db: Database,
	id: string,
): Promise<AgentRow | undefined> {
	return db.select().from(agents).where(eq(agents.id, id)).get();
}

/** Soft-deletes an agent (scoped to its owner), preserving its entries. */
export async function archiveAgent(
	db: Database,
	userId: string,
	id: string,
): Promise<boolean> {
	const rows = await db
		.update(agents)
		.set({ archivedAt: new Date() })
		.where(
			and(
				eq(agents.id, id),
				eq(agents.userId, userId),
				isNull(agents.archivedAt),
			),
		)
		.returning({ id: agents.id });
	return rows.length > 0;
}

/** Agents with at least one entry in the workspace (for the sidebar group). */
export async function listAgentsWithActivity(
	db: Database,
	workspaceId: string,
): Promise<Array<Pick<AgentRow, "id" | "type" | "name">>> {
	return db
		.selectDistinct({ id: agents.id, type: agents.type, name: agents.name })
		.from(agents)
		.innerJoin(agentEntries, eq(agentEntries.agentId, agents.id))
		.where(eq(agentEntries.workspaceId, workspaceId))
		.orderBy(asc(agents.name));
}

// --- agent tokens (AAT) ---

export async function createAgentToken(
	db: Database,
	input: {
		agentId: string;
		name: string;
		tokenHash: string;
		defaultWorkspaceId: string | null;
		defaultProjectId: string | null;
		expiresAt: Date | null;
	},
): Promise<AgentTokenRow> {
	const rows = await db
		.insert(agentTokens)
		.values({ id: crypto.randomUUID(), ...input })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("agent token insert returned no row");
	return row;
}

export async function listAgentTokensForAgent(
	db: Database,
	agentId: string,
): Promise<AgentTokenRow[]> {
	return db
		.select()
		.from(agentTokens)
		.where(eq(agentTokens.agentId, agentId))
		.orderBy(agentTokens.createdAt);
}

export async function findAgentTokenByHash(
	db: Database,
	tokenHash: string,
): Promise<AgentTokenRow | undefined> {
	return db
		.select()
		.from(agentTokens)
		.where(eq(agentTokens.tokenHash, tokenHash))
		.get();
}

export async function deleteAgentToken(
	db: Database,
	agentId: string,
	id: string,
): Promise<boolean> {
	const rows = await db
		.delete(agentTokens)
		.where(and(eq(agentTokens.id, id), eq(agentTokens.agentId, agentId)))
		.returning({ id: agentTokens.id });
	return rows.length > 0;
}

export async function touchAgentToken(db: Database, id: string): Promise<void> {
	await db
		.update(agentTokens)
		.set({ lastUsedAt: new Date() })
		.where(eq(agentTokens.id, id));
}

// --- agent entries ---

/**
 * Inserts a session entry, or updates it when (agentId, sessionId) already
 * exists. Idempotent so retries and daily batch reconciliation never duplicate.
 */
export async function upsertAgentEntry(
	db: Database,
	values: AgentEntryUpsert,
): Promise<AgentEntryRow> {
	const rows = await db
		.insert(agentEntries)
		.values({ id: crypto.randomUUID(), ...values })
		.onConflictDoUpdate({
			target: [agentEntries.agentId, agentEntries.sessionId],
			set: {
				workspaceId: values.workspaceId,
				ownerUserId: values.ownerUserId,
				projectId: values.projectId,
				entryDate: values.entryDate,
				durationMinutes: values.durationMinutes,
				usage: values.usage,
				description: values.description,
				startedAt: values.startedAt,
				endedAt: values.endedAt,
				updatedAt: new Date(),
			},
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error("agent entry upsert returned no row");
	return row;
}

interface AgentEntryFilter {
	workspaceId: string;
	agentId?: string;
	from?: string;
	to?: string;
}

function agentEntryConditions(query: AgentEntryFilter) {
	const conditions = [eq(agentEntries.workspaceId, query.workspaceId)];
	if (query.agentId) conditions.push(eq(agentEntries.agentId, query.agentId));
	if (query.from) conditions.push(gte(agentEntries.entryDate, query.from));
	if (query.to) conditions.push(lte(agentEntries.entryDate, query.to));
	return conditions;
}

export async function listAgentEntries(
	db: Database,
	query: AgentEntryFilter & { limit: number; offset: number },
): Promise<AgentEntryRow[]> {
	return db
		.select()
		.from(agentEntries)
		.where(and(...agentEntryConditions(query)))
		.orderBy(desc(agentEntries.entryDate), desc(agentEntries.createdAt))
		.limit(query.limit)
		.offset(query.offset);
}

export interface AgentEntryStatsResult {
	totalMinutes: number;
	totalTokens: number;
	entryCount: number;
	byDate: Array<{
		date: string;
		minutes: number;
		tokens: number;
		count: number;
	}>;
	byAgent: Array<{
		agentId: string;
		minutes: number;
		tokens: number;
		count: number;
	}>;
}

/** Aggregates entries matching the same filters as `listAgentEntries`. */
export async function getAgentEntryStats(
	db: Database,
	query: AgentEntryFilter,
): Promise<AgentEntryStatsResult> {
	const conditions = agentEntryConditions(query);
	const minutes =
		sql<number>`coalesce(sum(${agentEntries.durationMinutes}), 0)`.mapWith(
			Number,
		);
	// totalTokens lives inside the usage JSON; entries without usage count as 0.
	const tokens =
		sql<number>`coalesce(sum(coalesce(json_extract(${agentEntries.usage}, '$.totalTokens'), 0)), 0)`.mapWith(
			Number,
		);
	const count = sql<number>`count(*)`.mapWith(Number);

	const [byDate, byAgent] = await Promise.all([
		db
			.select({ date: agentEntries.entryDate, minutes, tokens, count })
			.from(agentEntries)
			.where(and(...conditions))
			.groupBy(agentEntries.entryDate)
			.orderBy(asc(agentEntries.entryDate)),
		db
			.select({ agentId: agentEntries.agentId, minutes, tokens, count })
			.from(agentEntries)
			.where(and(...conditions))
			.groupBy(agentEntries.agentId)
			.orderBy(desc(tokens)),
	]);

	return {
		totalMinutes: byDate.reduce((acc, row) => acc + row.minutes, 0),
		totalTokens: byDate.reduce((acc, row) => acc + row.tokens, 0),
		entryCount: byDate.reduce((acc, row) => acc + row.count, 0),
		byDate,
		byAgent,
	};
}
