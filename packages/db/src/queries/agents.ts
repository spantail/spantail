import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";

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

/**
 * Registers an agent together with its single access token. The two inserts
 * run in one batch so the 1:1 invariant holds atomically — a failure never
 * leaves a tokenless agent that the 1:1 UI could not issue a credential for.
 */
export async function createAgentWithToken(
	db: Database,
	input: {
		userId: string;
		type: AgentRow["type"];
		name: string;
		tokenName: string;
		tokenHash: string;
		defaultWorkspaceId: string;
		defaultProjectId: string | null;
		expiresAt: Date | null;
	},
): Promise<{ agent: AgentRow; token: AgentTokenRow }> {
	const agentId = crypto.randomUUID();
	// D1 has no interactive transactions; batch keeps both writes atomic.
	const [agentRows, tokenRows] = await db.batch([
		db
			.insert(agents)
			.values({
				id: agentId,
				userId: input.userId,
				type: input.type,
				name: input.name,
			})
			.returning(),
		db
			.insert(agentTokens)
			.values({
				id: crypto.randomUUID(),
				agentId,
				name: input.tokenName,
				tokenHash: input.tokenHash,
				defaultWorkspaceId: input.defaultWorkspaceId,
				defaultProjectId: input.defaultProjectId,
				expiresAt: input.expiresAt,
			})
			.returning(),
	]);
	const agent = agentRows[0];
	const token = tokenRows[0];
	if (!agent || !token) throw new Error("agent create returned no row");
	return { agent, token };
}

/** Public summary of an agent's single bound access token (no secret/hash). */
export type AgentTokenSummaryRow = {
	defaultWorkspaceId: string | null;
	defaultProjectId: string | null;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
};

/**
 * Active (non-archived) agents owned by the user with their single bound token,
 * newest first. Agent and token are 1:1, but a legacy agent may still carry
 * several token rows; the join is deduplicated to the oldest token per agent so
 * the 1:1 UI never receives a duplicated agent.
 */
export async function listAgentsWithTokenForUser(
	db: Database,
	userId: string,
): Promise<Array<AgentRow & { token: AgentTokenSummaryRow | null }>> {
	const rows = await db
		.select({
			agent: agents,
			tokenId: agentTokens.id,
			defaultWorkspaceId: agentTokens.defaultWorkspaceId,
			defaultProjectId: agentTokens.defaultProjectId,
			lastUsedAt: agentTokens.lastUsedAt,
			expiresAt: agentTokens.expiresAt,
		})
		.from(agents)
		.leftJoin(agentTokens, eq(agentTokens.agentId, agents.id))
		.where(and(eq(agents.userId, userId), isNull(agents.archivedAt)))
		.orderBy(desc(agents.createdAt), asc(agentTokens.createdAt));
	const seen = new Set<string>();
	const result: Array<AgentRow & { token: AgentTokenSummaryRow | null }> = [];
	for (const { agent, tokenId, ...token } of rows) {
		if (seen.has(agent.id)) continue;
		seen.add(agent.id);
		result.push({ ...agent, token: tokenId === null ? null : token });
	}
	return result;
}

/** Toggles an agent's reversible disabled state (scoped to its owner). */
export async function setAgentDisabled(
	db: Database,
	userId: string,
	id: string,
	disabled: boolean,
): Promise<AgentRow | undefined> {
	const rows = await db
		.update(agents)
		.set({ disabledAt: disabled ? new Date() : null })
		.where(
			and(
				eq(agents.id, id),
				eq(agents.userId, userId),
				isNull(agents.archivedAt),
			),
		)
		.returning();
	return rows[0];
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

/**
 * Rotates an agent's token to a new secret in place, keeping its binding and
 * expiry. lastUsedAt resets so the summary reflects the fresh credential.
 *
 * Rotation also collapses the agent to a single token: any legacy extra rows
 * (the removed multi-token API could create them) are deleted, so every prior
 * secret is revoked — never left live yet hidden from the 1:1 UI — and the
 * surviving row can't collide on the unique tokenHash.
 */
export async function rotateAgentToken(
	db: Database,
	agentId: string,
	tokenHash: string,
): Promise<AgentTokenRow | undefined> {
	const survivor = await db
		.select({ id: agentTokens.id })
		.from(agentTokens)
		.where(eq(agentTokens.agentId, agentId))
		.orderBy(agentTokens.createdAt)
		.get();
	if (!survivor) return undefined;
	await db
		.delete(agentTokens)
		.where(
			and(eq(agentTokens.agentId, agentId), ne(agentTokens.id, survivor.id)),
		);
	const rows = await db
		.update(agentTokens)
		.set({ tokenHash, lastUsedAt: null })
		.where(eq(agentTokens.id, survivor.id))
		.returning();
	return rows[0];
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
