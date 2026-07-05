import {
	type AgentEntryContext,
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
	or,
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
				context: values.context,
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

/**
 * Rows for the given ids, backing the ownership pre-checks of work-entry
 * linking and bulk deletion. Both callers cap `ids` at
 * MAX_LINKED_AGENT_ENTRIES (50), well under D1's 100-bound-parameter cap, so
 * one statement suffices.
 */
export async function getAgentEntriesByIds(
	db: Database,
	ids: string[],
): Promise<AgentEntryRow[]> {
	if (ids.length === 0) return [];
	return db.select().from(agentEntries).where(inArray(agentEntries.id, ids));
}

// Each (agentId, sessionId) pair binds 2 parameters, plus 1 for the
// workspace: a chunk of 40 keeps an event-delete statement at 81 binds,
// under D1's 100-bound-parameter cap.
const EVENT_DELETE_CHUNK = 40;

/**
 * Deletes the caller-owned agent entries among `ids`, returning how many rows
 * went away. The workspace + owner scope is applied in SQL, so the delete
 * stays safe even if a row changed hands between the route's pre-check and
 * this statement. Link rows in work_entry_agent_entries cascade away, and the
 * sessions' raw agent_events go in the same db.batch — events tie to a
 * session by (agentId, sessionId), not a FK, and the rollup is recomputed
 * from them on every event ingest, so leaving them behind would let a
 * late event retry resurrect a deleted session from its full history.
 */
export async function deleteAgentEntries(
	db: Database,
	ids: string[],
	scope: { workspaceId: string; ownerUserId: string },
): Promise<number> {
	if (ids.length === 0) return 0;
	const scoped = and(
		inArray(agentEntries.id, ids),
		eq(agentEntries.workspaceId, scope.workspaceId),
		eq(agentEntries.ownerUserId, scope.ownerUserId),
	);
	// The event delete needs the sessions' natural keys before the rows go.
	const sessions = await db
		.select({
			agentId: agentEntries.agentId,
			sessionId: agentEntries.sessionId,
		})
		.from(agentEntries)
		.where(scoped);
	if (sessions.length === 0) return 0;
	const deleteEntries = db
		.delete(agentEntries)
		.where(scoped)
		.returning({ id: agentEntries.id });
	const deleteEvents = [];
	for (let i = 0; i < sessions.length; i += EVENT_DELETE_CHUNK) {
		const chunk = sessions.slice(i, i + EVENT_DELETE_CHUNK);
		deleteEvents.push(
			db
				.delete(agentEvents)
				.where(
					and(
						eq(agentEvents.workspaceId, scope.workspaceId),
						or(
							...chunk.map((s) =>
								and(
									eq(agentEvents.agentId, s.agentId),
									eq(agentEvents.sessionId, s.sessionId),
								),
							),
						),
					),
				),
		);
	}
	const [rows] = await db.batch([deleteEntries, ...deleteEvents]);
	return rows.length;
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
	return (
		db
			.select()
			.from(agentEntries)
			.where(and(...agentEntryConditions(query)))
			// `id` breaks ties on equal `startedAt` so pagination is stable (no rows
			// duplicated or skipped across pages).
			.orderBy(desc(agentEntries.startedAt), desc(agentEntries.id))
			.limit(query.limit)
			.offset(query.offset)
	);
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
 * day is a read-time projection rather than a stored value. Token buckets are
 * extracted in SQL so only a few numbers (not the full `usage` JSON) per row are
 * materialized. The caller supplies a bounded `from`/`to` window (required by
 * `agentEntryStatsQuerySchema`), so the scan is never open-ended.
 */
export async function getAgentEntryStats(
	db: Database,
	query: AgentEntryFilter,
): Promise<AgentEntryStatsResult> {
	const conditions = agentEntryConditions(query);
	// Token buckets live inside the usage JSON; entries without usage count as 0.
	const tokenBucket = (key: string) =>
		sql<number>`coalesce(json_extract(${agentEntries.usage}, ${`$.${key}`}), 0)`.mapWith(
			Number,
		);
	const rows = await db
		.select({
			agentId: agentEntries.agentId,
			startedAt: agentEntries.startedAt,
			durationMinutes: agentEntries.durationMinutes,
			tokens: tokenBucket("totalTokens"),
			inputTokens: tokenBucket("inputTokens"),
			outputTokens: tokenBucket("outputTokens"),
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
		const { durationMinutes: minutes, tokens, inputTokens, outputTokens } = row;

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

// D1 caps a query at 100 bound parameters. Each event row binds 11 columns
// (id + 10 fields; createdAt uses its default), so a chunk of 8 stays under
// the cap (88). The unique index makes re-inserting seen rows a no-op, so
// splitting a session across statements is safe.
const EVENT_INSERT_CHUNK = 8;

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
	/** Event-derived facets for `agent_entries.context`; null when none exist. */
	context: AgentEntryContext | null;
	startedAt: Date;
	endedAt: Date;
	durationMinutes: number;
	eventCount: number;
}

// Context facets keep at most this many distinct values, each at most this
// long — the bounds `agentEntryContextSchema` enforces on the read side.
const CONTEXT_VALUES_MAX = 20;
const CONTEXT_VALUE_LENGTH_MAX = 200;

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
			// Null (not 0) when no event carries a cost: absence and "free" differ.
			costUsd: sql<number | null>`sum(${agentEvents.costUsd})`.mapWith(
				(value) => (value == null ? null : Number(value)),
			),
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
	// id breaks timestamp ties so the pick is stable.
	const [latest] = await db
		.select({ model: agentEvents.model })
		.from(agentEvents)
		.where(and(where, isNotNull(agentEvents.model)))
		.orderBy(desc(agentEvents.timestamp), desc(agentEvents.id))
		.limit(1);

	// Context facets are aggregated in SQL (distinct values in first-seen
	// order, LIMIT-bounded) so the result stays O(1) no matter how many events
	// a session holds — ingest is the untrusted write path, and a hostile
	// session must not be able to balloon Worker memory. Values are checked
	// defensively in SQL: attributes are stored verbatim, so only text values
	// within the context schema's bounds qualify.
	const distinctFacet = async (
		value: SQL<string>,
		isBoundedText: SQL<unknown>,
	): Promise<string[] | undefined> => {
		const rows = await db
			.select({ value })
			.from(agentEvents)
			.where(and(where, isBoundedText))
			.groupBy(value)
			.orderBy(sql`min(${agentEvents.timestamp})`, sql`min(${agentEvents.id})`)
			.limit(CONTEXT_VALUES_MAX);
		return rows.length > 0 ? rows.map((row) => row.value) : undefined;
	};
	const attributeFacet = (key: string) => {
		const path = `$."${key}"`;
		const value = sql<string>`json_extract(${agentEvents.attributes}, ${path})`;
		return distinctFacet(
			value,
			sql`json_type(${agentEvents.attributes}, ${path}) = 'text'
				and length(${value}) between 1 and ${CONTEXT_VALUE_LENGTH_MAX}`,
		);
	};
	const models = await distinctFacet(
		sql<string>`${agentEvents.model}`,
		sql`${agentEvents.model} is not null
			and length(${agentEvents.model}) between 1 and ${CONTEXT_VALUE_LENGTH_MAX}`,
	);
	const branches = await attributeFacet("vcs.ref.head.name");
	const repositories = await attributeFacet("vcs.repository.url.full");
	const context: AgentEntryContext | null =
		models || branches || repositories
			? {
					...(models ? { models } : {}),
					...(branches ? { branches } : {}),
					...(repositories ? { repositories } : {}),
				}
			: null;

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
			...(agg.costUsd != null ? { costUsd: agg.costUsd } : {}),
		},
		context,
		startedAt: new Date(agg.minTs),
		endedAt: new Date(agg.maxTs),
		durationMinutes,
		eventCount: agg.count,
	};
}

/**
 * Materializes a session's rollup into `agent_entries`, monotonically. Events
 * are append-only, so a later recompute is always a superset of an earlier
 * one: its event count is non-decreasing, and an equal count means the same
 * event set (hence an identical rollup). The conflict update is guarded on
 * that count — with the token sum kept as a second condition for legacy rows
 * that predate the count — so a stale recompute (computed before a concurrent
 * ingest's events landed) can never overwrite a fuller one, even when the
 * newer events carry no tokens (a tool turn whose cost/context still moved).
 * Either ordering converges to the most complete rollup. `endedAt` and
 * `durationMinutes` only ever grow in SQL (a finalize may have recorded a
 * wall-clock end past the last event, which a later recompute must not
 * shrink), and finalize-owned fields are preserved: `description` is never
 * touched, and `context` is merged key-by-key (the rollup owns the
 * event-derived facets; keys it doesn't produce, like `refs`, survive).
 * Returns the current row (ours, or the newer one a concurrent ingest wrote).
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
				// Recomputed from the final bounds rather than max()-ed as a value:
				// a late ingest can move startedAt earlier while a finalize already
				// pushed endedAt past the last event, and only (end − start) covers
				// that combination. Both bounds are monotonic, so the duration is too.
				durationMinutes: sql`cast(round((max(coalesce(excluded.ended_at, 0), coalesce(${agentEntries.endedAt}, 0)) - excluded.started_at) / 60000.0) as integer)`,
				usage: values.usage,
				context: sql`case
					when excluded.context is null then ${agentEntries.context}
					else json_patch(coalesce(${agentEntries.context}, '{}'), excluded.context)
				end`,
				startedAt: values.startedAt,
				endedAt: sql`max(coalesce(excluded.ended_at, 0), coalesce(${agentEntries.endedAt}, 0))`,
				rollupEventCount: values.rollupEventCount,
				updatedAt: new Date(),
			},
			setWhere: sql`${agentEntries.usage} is null or (
				coalesce(excluded.rollup_event_count, 0) >= coalesce(${agentEntries.rollupEventCount}, 0)
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

/**
 * Applies a session's closing facts (e.g. Claude Code's SessionEnd hook):
 * wall-clock end, summary description, extra context. Never touches the usage
 * rollup, which stays derived from events. Monotonic like the rollup
 * materialization — `endedAt`/`durationMinutes` only grow, in SQL — so a
 * finalize racing a late ingest converges regardless of order. Scoped by
 * workspace like ingest; returns undefined when the session has no entry there
 * yet (events never arrived), which callers surface as 404.
 */
export async function finalizeAgentSession(
	db: Database,
	input: {
		agentId: string;
		workspaceId: string;
		sessionId: string;
		endedAt: Date | null;
		description: string | null;
		// Only the client-owned facet: the rollup owns the event-derived ones,
		// which a finalize must never overwrite (enforced by the input schema and
		// this type both).
		context: Pick<AgentEntryContext, "refs"> | null;
	},
): Promise<AgentEntryRow | undefined> {
	const endedAtMs = input.endedAt?.getTime();
	// Clamp the finalized end to startedAt as well: a bad client clock (or a
	// hostile token) must not produce a session that ends before it starts.
	const clampedEnd = (ms: number) =>
		sql`max(${ms}, coalesce(${agentEntries.endedAt}, 0), ${agentEntries.startedAt})`;
	const rows = await db
		.update(agentEntries)
		.set({
			updatedAt: new Date(),
			...(endedAtMs !== undefined
				? {
						endedAt: clampedEnd(endedAtMs),
						// Extend the duration to the finalized end; never shrink it.
						durationMinutes: sql`max(${agentEntries.durationMinutes},
							cast(round((${clampedEnd(endedAtMs)} - ${agentEntries.startedAt}) / 60000.0) as integer))`,
					}
				: {}),
			...(input.description !== null ? { description: input.description } : {}),
			...(input.context
				? {
						context: sql`json_patch(coalesce(${agentEntries.context}, '{}'), ${JSON.stringify(input.context)})`,
					}
				: {}),
		})
		.where(
			and(
				eq(agentEntries.agentId, input.agentId),
				eq(agentEntries.workspaceId, input.workspaceId),
				eq(agentEntries.sessionId, input.sessionId),
			),
		)
		.returning();
	return rows[0];
}
