import {
	type AgentUsage,
	shiftDays,
	todayInTimezone,
	zonedDateTimeToUtc,
} from "@spantail/core";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	ne,
	type SQL,
	sql,
} from "drizzle-orm";

import type { Database } from "../index";
import {
	agentEntries,
	agentEvents,
	agentProjects,
	agents,
	agentTokens,
} from "../schema/agents";
import { type EntryAccessScope, entryAccessCondition } from "./entry-access";

export type AgentRow = typeof agents.$inferSelect;
export type AgentTokenRow = typeof agentTokens.$inferSelect;
export type AgentEntryRow = typeof agentEntries.$inferSelect;
export type AgentEntryUpsert = Omit<
	typeof agentEntries.$inferInsert,
	"id" | "createdAt" | "updatedAt"
>;
export type AgentEventRow = typeof agentEvents.$inferSelect;
export type AgentEventInsert = Omit<
	typeof agentEvents.$inferInsert,
	"id" | "createdAt"
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
		projectIds: string[];
		expiresAt: Date | null;
	},
): Promise<{ agent: AgentRow; token: AgentTokenRow }> {
	const agentId = crypto.randomUUID();
	const insertAgent = db
		.insert(agents)
		.values({
			id: agentId,
			userId: input.userId,
			type: input.type,
			name: input.name,
		})
		.returning();
	const insertToken = db
		.insert(agentTokens)
		.values({
			id: crypto.randomUUID(),
			agentId,
			name: input.tokenName,
			tokenHash: input.tokenHash,
			defaultWorkspaceId: input.defaultWorkspaceId,
			expiresAt: input.expiresAt,
		})
		.returning();
	// D1 has no interactive transactions; one batch keeps the agent, its token,
	// and its project associations atomic. An empty projectIds means "all
	// projects", so no association rows are written (and no empty insert is run).
	const [agentRows, tokenRows] = await (input.projectIds.length > 0
		? db.batch([
				insertAgent,
				insertToken,
				db
					.insert(agentProjects)
					.values(
						input.projectIds.map((projectId) => ({ agentId, projectId })),
					),
			])
		: db.batch([insertAgent, insertToken]));
	const agent = agentRows[0];
	const token = tokenRows[0];
	if (!agent || !token) throw new Error("agent create returned no row");
	return { agent, token };
}

/** Public summary of an agent's single bound access token (no secret/hash). */
export type AgentTokenSummaryRow = {
	defaultWorkspaceId: string | null;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
};

export type AgentWithToken = AgentRow & {
	token: AgentTokenSummaryRow | null;
	projectIds: string[];
};

/**
 * Active (non-archived) agents matching `where`, with their single bound token
 * and associated project ids, newest first. Agent and token are 1:1, but a
 * legacy agent may still carry several token rows; the join is deduplicated to
 * the oldest token per agent so the 1:1 UI never receives a duplicated agent.
 * An empty `projectIds` means the agent is associated with all projects.
 *
 * `tokenWorkspaceId` constrains the joined token to one default workspace, so a
 * workspace-scoped read returns a token summary guaranteed to match that
 * workspace even for a legacy agent with several token rows (no foreign default
 * workspace id leaks through the oldest-token dedup).
 */
async function listAgentsWithToken(
	db: Database,
	where: SQL | undefined,
	tokenWorkspaceId?: string,
): Promise<AgentWithToken[]> {
	const tokenJoin = tokenWorkspaceId
		? and(
				eq(agentTokens.agentId, agents.id),
				eq(agentTokens.defaultWorkspaceId, tokenWorkspaceId),
			)
		: eq(agentTokens.agentId, agents.id);
	const rows = await db
		.select({
			agent: agents,
			tokenId: agentTokens.id,
			defaultWorkspaceId: agentTokens.defaultWorkspaceId,
			lastUsedAt: agentTokens.lastUsedAt,
			expiresAt: agentTokens.expiresAt,
		})
		.from(agents)
		.leftJoin(agentTokens, tokenJoin)
		.where(where)
		.orderBy(desc(agents.createdAt), asc(agentTokens.createdAt));
	const seen = new Set<string>();
	const result: AgentWithToken[] = [];
	for (const { agent, tokenId, ...token } of rows) {
		if (seen.has(agent.id)) continue;
		seen.add(agent.id);
		result.push({
			...agent,
			token: tokenId === null ? null : token,
			projectIds: [],
		});
	}
	if (result.length > 0) {
		const links = await db
			.select({
				agentId: agentProjects.agentId,
				projectId: agentProjects.projectId,
			})
			.from(agentProjects)
			.where(
				inArray(
					agentProjects.agentId,
					result.map((a) => a.id),
				),
			)
			// Stable, deterministic projectIds order regardless of query plan.
			.orderBy(agentProjects.projectId);
		const byAgent = new Map<string, string[]>();
		for (const link of links) {
			const ids = byAgent.get(link.agentId) ?? [];
			ids.push(link.projectId);
			byAgent.set(link.agentId, ids);
		}
		for (const agent of result) {
			agent.projectIds = byAgent.get(agent.id) ?? [];
		}
	}
	return result;
}

/** A single user's active agents with token + project ids (their own list). */
export function listAgentsWithTokenForUser(
	db: Database,
	userId: string,
): Promise<AgentWithToken[]> {
	return listAgentsWithToken(
		db,
		and(eq(agents.userId, userId), isNull(agents.archivedAt)),
	);
}

/**
 * Every active agent *bound to* the workspace (its token's default workspace),
 * regardless of owner — a workspace/instance admin's read of the agent registry
 * under a workspace (matrix `R`/`R*`). Scoped to bound agents only: an agent
 * that merely logged activity here but belongs to another workspace would expose
 * its foreign binding and project ids, breaking R*; that cross-workspace
 * *activity* is still readable through agent entries, which carry their own
 * workspace id. Same shape as the owner list; secrets are never selected (token
 * summary only). The correlated EXISTS keeps it clear of D1's parameter limit.
 */
export function listAgentsByWorkspace(
	db: Database,
	workspaceId: string,
): Promise<AgentWithToken[]> {
	return listAgentsWithToken(
		db,
		and(
			isNull(agents.archivedAt),
			sql`exists (select 1 from ${agentTokens} where ${agentTokens.agentId} = ${agents.id} and ${agentTokens.defaultWorkspaceId} = ${workspaceId})`,
		),
		// Constrain the joined token to this workspace so the deduped summary
		// always reports this workspace, never a legacy token bound elsewhere.
		workspaceId,
	);
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

/**
 * The caller's own agents shown under a workspace in the sidebar. Two arms,
 * unioned and deduplicated:
 *  - the caller's non-archived agents with at least one entry in the workspace
 *    (their activity here), and
 *  - the caller's non-archived agents registered to the workspace (their token's
 *    default workspace), so a freshly registered agent appears immediately even
 *    before it has logged work.
 * Scoped to the caller so members never see each other's agents.
 */
export async function listWorkspaceAgents(
	db: Database,
	workspaceId: string,
	userId: string,
): Promise<Array<Pick<AgentRow, "id" | "type" | "name">>> {
	const select = { id: agents.id, type: agents.type, name: agents.name };
	const [active, registered] = await Promise.all([
		db
			.selectDistinct(select)
			.from(agents)
			.innerJoin(agentEntries, eq(agentEntries.agentId, agents.id))
			.where(
				and(
					eq(agents.userId, userId),
					eq(agentEntries.workspaceId, workspaceId),
					isNull(agents.archivedAt),
				),
			),
		db
			.selectDistinct(select)
			.from(agents)
			.innerJoin(agentTokens, eq(agentTokens.agentId, agents.id))
			.where(
				and(
					eq(agents.userId, userId),
					eq(agentTokens.defaultWorkspaceId, workspaceId),
					isNull(agents.archivedAt),
				),
			),
	]);
	const byId = new Map<string, Pick<AgentRow, "id" | "type" | "name">>();
	for (const agent of [...active, ...registered]) byId.set(agent.id, agent);
	// Code-point order (matching SQLite's default BINARY collation) keeps the
	// sidebar stable across runtimes, unlike locale-dependent localeCompare.
	// id breaks name ties so the order is fully deterministic, not sort-stability
	// dependent.
	return [...byId.values()].sort((a, b) => {
		if (a.name !== b.name) return a.name < b.name ? -1 : 1;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
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
	// When set, restricts to entries logged for this owner. Callers scope it to
	// the requesting user so members see only their own agents' activity.
	ownerUserId?: string;
	agentId?: string;
	// Inclusive local-date range, interpreted in `timezone` and converted to a
	// `startedAt` instant range. Agent entries carry no stored date.
	from?: string;
	to?: string;
	// The viewing user's timezone: agent days are derived from `startedAt` in it,
	// both for range filtering and for the per-day buckets returned to callers.
	timezone: string;
	// Project ACL: restricts results to agent entries the caller may read.
	access?: EntryAccessScope;
}

function agentEntryConditions(query: AgentEntryFilter) {
	const conditions = [eq(agentEntries.workspaceId, query.workspaceId)];
	if (query.ownerUserId) {
		conditions.push(eq(agentEntries.ownerUserId, query.ownerUserId));
	}
	if (query.agentId) conditions.push(eq(agentEntries.agentId, query.agentId));
	// Convert the local-date window to a half-open [from 00:00, to+1 00:00) instant
	// range in the viewer's timezone, so a session is in-range on the same day the
	// per-day buckets place it.
	if (query.from) {
		const lo = new Date(
			zonedDateTimeToUtc(query.from, "00:00", query.timezone),
		);
		conditions.push(gte(agentEntries.startedAt, lo));
	}
	if (query.to) {
		const hi = new Date(
			zonedDateTimeToUtc(shiftDays(query.to, 1), "00:00", query.timezone),
		);
		conditions.push(lt(agentEntries.startedAt, hi));
	}
	if (query.access) {
		// Agent activity is private by default: unassigned (no-project) sessions
		// stay owner-only, unlike work entries which are workspace-wide.
		const cond = entryAccessCondition(
			{
				workspaceId: agentEntries.workspaceId,
				projectId: agentEntries.projectId,
				self: agentEntries.ownerUserId,
			},
			query.access,
			{ unassignedWorkspaceWide: false },
		);
		if (cond) conditions.push(cond);
	}
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
		.orderBy(desc(agentEntries.startedAt))
		.limit(query.limit)
		.offset(query.offset);
}

export interface AgentEntryStatsResult {
	totalMinutes: number;
	totalTokens: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	entryCount: number;
	byDate: Array<{
		date: string;
		minutes: number;
		tokens: number;
		inputTokens: number;
		outputTokens: number;
		count: number;
	}>;
	byAgent: Array<{
		agentId: string;
		minutes: number;
		tokens: number;
		count: number;
	}>;
}

/**
 * Aggregates entries matching the same filters as `listAgentEntries`. Per-day
 * buckets are computed in application code from each session's `startedAt` in
 * the viewer's timezone — SQLite/D1 has no IANA-timezone date functions, and the
 * day is a read-time projection rather than a stored value.
 */
export async function getAgentEntryStats(
	db: Database,
	query: AgentEntryFilter,
): Promise<AgentEntryStatsResult> {
	const conditions = agentEntryConditions(query);
	const rows = await db
		.select({
			agentId: agentEntries.agentId,
			startedAt: agentEntries.startedAt,
			durationMinutes: agentEntries.durationMinutes,
			usage: agentEntries.usage,
		})
		.from(agentEntries)
		.where(and(...conditions));

	type DayBucket = AgentEntryStatsResult["byDate"][number];
	type AgentBucket = AgentEntryStatsResult["byAgent"][number];
	const byDateMap = new Map<string, DayBucket>();
	const byAgentMap = new Map<string, AgentBucket>();
	let totalMinutes = 0;
	let totalTokens = 0;
	let totalInputTokens = 0;
	let totalOutputTokens = 0;

	for (const row of rows) {
		const date = todayInTimezone(query.timezone, row.startedAt);
		const minutes = row.durationMinutes;
		// Agents that don't expose token buckets contribute 0 to each.
		const tokens = row.usage?.totalTokens ?? 0;
		const inputTokens = row.usage?.inputTokens ?? 0;
		const outputTokens = row.usage?.outputTokens ?? 0;

		const day = byDateMap.get(date) ?? {
			date,
			minutes: 0,
			tokens: 0,
			inputTokens: 0,
			outputTokens: 0,
			count: 0,
		};
		day.minutes += minutes;
		day.tokens += tokens;
		day.inputTokens += inputTokens;
		day.outputTokens += outputTokens;
		day.count += 1;
		byDateMap.set(date, day);

		const agent = byAgentMap.get(row.agentId) ?? {
			agentId: row.agentId,
			minutes: 0,
			tokens: 0,
			count: 0,
		};
		agent.minutes += minutes;
		agent.tokens += tokens;
		agent.count += 1;
		byAgentMap.set(row.agentId, agent);

		totalMinutes += minutes;
		totalTokens += tokens;
		totalInputTokens += inputTokens;
		totalOutputTokens += outputTokens;
	}

	const byDate = [...byDateMap.values()].sort((a, b) =>
		a.date.localeCompare(b.date),
	);
	const byAgent = [...byAgentMap.values()].sort((a, b) => b.tokens - a.tokens);

	return {
		totalMinutes,
		totalTokens,
		totalInputTokens,
		totalOutputTokens,
		entryCount: rows.length,
		byDate,
		byAgent,
	};
}

// --- agent events (raw per-turn telemetry) ---

// D1 caps a query at 100 bound parameters. Each event row binds 8 columns
// (id + 7 fields; createdAt uses its default), so a chunk of 10 stays well
// under the cap (80). The unique index makes re-inserting seen rows a no-op,
// so splitting a session across statements is safe.
const EVENT_INSERT_CHUNK = 10;

/**
 * Idempotently inserts a session's events. `ON CONFLICT DO NOTHING` on the
 * (agentId, sourceId) unique index makes re-sending seen message.ids a no-op,
 * so the Stop hook can re-post the whole cumulative transcript every turn. The
 * caller recomputes the rollup afterward regardless of how many rows were new.
 */
export async function insertAgentEventsIgnoreConflicts(
	db: Database,
	rows: AgentEventInsert[],
): Promise<void> {
	for (let i = 0; i < rows.length; i += EVENT_INSERT_CHUNK) {
		const chunk = rows.slice(i, i + EVENT_INSERT_CHUNK);
		await db
			.insert(agentEvents)
			.values(chunk.map((r) => ({ id: crypto.randomUUID(), ...r })))
			.onConflictDoNothing({
				target: [agentEvents.agentId, agentEvents.sourceId],
			});
	}
}

export interface SessionRollup {
	/** Normalized rollup written to `agent_entries.usage` (camelCase AgentUsage). */
	usage: AgentUsage;
	startedAt: Date;
	endedAt: Date;
	durationMinutes: number;
	eventCount: number;
}

/** Sums one raw usage bucket (snake_case JSON key) across a session's events. */
function usageBucketSum(key: string) {
	return sql<number>`coalesce(sum(coalesce(json_extract(${agentEvents.usage}, ${`$.${key}`}), 0)), 0)`.mapWith(
		Number,
	);
}

/**
 * Aggregates ONE session's events into the rollup `agent_entries` materializes.
 * Bounded to a single session's rows. Token buckets are summed from the raw
 * snake_case `usage` JSON and normalized to the camelCase AgentUsage shape, so
 * the existing `getAgentEntryStats` (which reads `usage.totalTokens`) keeps
 * working unchanged. Returns null when the session has no events yet.
 */
export async function computeSessionRollup(
	db: Database,
	agentId: string,
	sessionId: string,
): Promise<SessionRollup | null> {
	const where = and(
		eq(agentEvents.agentId, agentId),
		eq(agentEvents.sessionId, sessionId),
	);
	const [agg] = await db
		.select({
			inputTokens: usageBucketSum("input_tokens"),
			outputTokens: usageBucketSum("output_tokens"),
			cacheCreationTokens: usageBucketSum("cache_creation_input_tokens"),
			cacheReadTokens: usageBucketSum("cache_read_input_tokens"),
			minTs: sql<number | null>`min(${agentEvents.timestamp})`,
			maxTs: sql<number | null>`max(${agentEvents.timestamp})`,
			count: sql<number>`count(*)`.mapWith(Number),
		})
		.from(agentEvents)
		.where(where);

	if (!agg || agg.count === 0 || agg.minTs == null || agg.maxTs == null) {
		return null;
	}

	// Model of the most recent event that carries one; undefined when none do.
	const [latest] = await db
		.select({ model: agentEvents.model })
		.from(agentEvents)
		.where(and(where, isNotNull(agentEvents.model)))
		.orderBy(desc(agentEvents.timestamp))
		.limit(1);

	const totalTokens =
		agg.inputTokens +
		agg.outputTokens +
		agg.cacheCreationTokens +
		agg.cacheReadTokens;
	const durationMinutes = Math.max(
		0,
		Math.round((agg.maxTs - agg.minTs) / 60000),
	);

	return {
		usage: {
			inputTokens: agg.inputTokens,
			outputTokens: agg.outputTokens,
			cacheCreationTokens: agg.cacheCreationTokens,
			cacheReadTokens: agg.cacheReadTokens,
			totalTokens,
			...(latest?.model ? { model: latest.model } : {}),
		},
		startedAt: new Date(agg.minTs),
		endedAt: new Date(agg.maxTs),
		durationMinutes,
		eventCount: agg.count,
	};
}

/**
 * Materializes a session's rollup into `agent_entries`, monotonically. Every
 * ingest re-sends the cumulative transcript, so a later recompute is always a
 * superset of an earlier one — its `endedAt` and `totalTokens` are both
 * non-decreasing. The conflict update is guarded to apply only when both hold,
 * so a stale recompute (computed before a concurrent ingest's events landed)
 * can never overwrite a fuller one, even when the fuller payload added an event
 * whose timestamp is at or before the current `endedAt` (e.g. a subagent turn)
 * — there `endedAt` is unchanged but `totalTokens` still grows. Either ordering
 * converges to the most complete rollup. Returns the current row (ours, or the
 * newer one a concurrent ingest already wrote).
 */
export async function materializeAgentSessionRollup(
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
				durationMinutes: values.durationMinutes,
				usage: values.usage,
				description: values.description,
				startedAt: values.startedAt,
				endedAt: values.endedAt,
				updatedAt: new Date(),
			},
			setWhere: sql`${agentEntries.usage} is null or (
				excluded.ended_at >= coalesce(${agentEntries.endedAt}, 0)
				and coalesce(json_extract(excluded.usage, '$.totalTokens'), 0) >= coalesce(json_extract(${agentEntries.usage}, '$.totalTokens'), 0)
			)`,
		})
		.returning();
	const row = rows[0];
	if (row) return row;
	// The guard skipped the update (a newer rollup already exists): return it.
	const current = await db
		.select()
		.from(agentEntries)
		.where(
			and(
				eq(agentEntries.agentId, values.agentId),
				eq(agentEntries.sessionId, values.sessionId),
			),
		)
		.get();
	if (!current) throw new Error("agent entry rollup returned no row");
	return current;
}
