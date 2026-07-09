import {
	type AgentEntryContext,
	type AgentUsage,
	agentTypes,
} from "@spantail/core";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAtMs, projects, workEntries, workspaces } from "./domain";

/**
 * A registered AI coding agent. Account-scoped: a delegated identity of one
 * user, not an independent principal.
 */
export const agents = sqliteTable(
	"agents",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: text("type", { enum: agentTypes }).notNull(),
		name: text("name").notNull(),
		createdAt: createdAtMs(),
		// Reversible deactivation: a disabled agent's token is rejected at ingest
		// but the agent and its history remain (distinct from archivedAt's delete).
		disabledAt: integer("disabled_at", { mode: "timestamp_ms" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
	},
	(table) => [index("agents_user_idx").on(table.userId)],
);

/**
 * Agent access token (AAT): a write-only ingest credential bound to one agent.
 * Carries no scopes — its capability is structurally "ingest for this agent".
 * An optional default workspace binds where omitted-scope ingests land.
 */
export const agentTokens = sqliteTable(
	"agent_tokens",
	{
		id: text("id").primaryKey(),
		agentId: text("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		// SHA-256 hex digest; the plaintext token is shown once and never stored.
		tokenHash: text("token_hash").notNull().unique(),
		defaultWorkspaceId: text("default_workspace_id").references(
			() => workspaces.id,
			{ onDelete: "cascade" },
		),
		lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		createdAt: createdAtMs(),
	},
	(table) => [index("agent_tokens_agent_idx").on(table.agentId)],
);

/**
 * Projects an agent is associated with, within its bound workspace. Purely a
 * presentation grouping (it does not gate or default ingest): no rows for an
 * agent means "all projects". Chosen once at registration.
 */
export const agentProjects = sqliteTable(
	"agent_projects",
	{
		agentId: text("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.agentId, table.projectId] })],
);

/** One agent work session, attributed to the owning user and a workspace. */
export const agentEntries = sqliteTable(
	"agent_entries",
	{
		id: text("id").primaryKey(),
		// Denormalized workspace id keeps every membership-scoped query cheap.
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		// The user the agent acts for; entries inherit this user's visibility.
		ownerUserId: text("owner_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		agentId: text("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		// External session identifier; (agentId, sessionId) is the idempotency key.
		sessionId: text("session_id").notNull(),
		durationMinutes: integer("duration_minutes").notNull(),
		// Null when the source can't expose token usage locally (e.g. Cursor).
		usage: text("usage", { mode: "json" }).$type<AgentUsage | null>(),
		// Non-usage session context (distinct models, branches, refs, ...). The
		// rollup owns the event-derived facets; finalize/summary input is merged in.
		context: text("context", {
			mode: "json",
		}).$type<AgentEntryContext | null>(),
		// Internal rollup bookkeeping: how many events the materialized rollup was
		// computed from. Events are append-only, so this is the exact monotonic
		// staleness measure for the conflict-update guard (token sums alone can
		// tie when a new event carries no tokens, e.g. a tool turn). Null on
		// summary-path rows, which carry no events.
		rollupEventCount: integer("rollup_event_count"),
		description: text("description"),
		// Agent sessions are always timestamped; the calendar day is derived from
		// startedAt at read time in the viewing user's timezone (no frozen date).
		startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
		endedAt: integer("ended_at", { mode: "timestamp_ms" }),
		createdAt: createdAtMs(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("agent_entries_session_uq").on(table.agentId, table.sessionId),
		// Range queries filter by startedAt (the day-bucket key) within a workspace.
		index("agent_entries_workspace_idx").on(table.workspaceId, table.startedAt),
		index("agent_entries_agent_idx").on(table.agentId),
	],
);

/**
 * Provenance link: which agent sessions a human work entry was logged from
 * (many-to-many). Rows are written when a work entry is created from selected
 * agent entries and cascade away with either side; read back, ACL-filtered, by
 * `GET /api/v1/work-entries/:id/agent-entries`.
 */
export const workEntryAgentEntries = sqliteTable(
	"work_entry_agent_entries",
	{
		workEntryId: text("work_entry_id")
			.notNull()
			.references(() => workEntries.id, { onDelete: "cascade" }),
		agentEntryId: text("agent_entry_id")
			.notNull()
			.references(() => agentEntries.id, { onDelete: "cascade" }),
		createdAt: createdAtMs(),
	},
	(table) => [
		primaryKey({ columns: [table.workEntryId, table.agentEntryId] }),
		// The composite PK only covers workEntryId-first lookups; the agent-entry
		// side (cascade checks, per-session lookups) needs its own index.
		index("work_entry_agent_entries_agent_entry_idx").on(table.agentEntryId),
	],
);

/**
 * Raw per-turn telemetry: one row per assistant message (one API response, which
 * carries exactly one `usage`). Immutable and append-only; the materialized
 * per-session rollup lives in `agent_entries`, recomputed from these rows on
 * ingest. Keyed by the natural (agentId, sessionId) pair — NOT a FK to
 * `agent_entries.id`, since events for a session can arrive before its entry is
 * upserted (the recompute reads events, then writes the entry).
 */
export const agentEvents = sqliteTable(
	"agent_events",
	{
		id: text("id").primaryKey(),
		agentId: text("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		// Denormalized so per-workspace retention/cleanup stays cheap.
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		sessionId: text("session_id").notNull(),
		// The transcript assistant message.id; the idempotency key within an agent.
		// Re-sending a seen message.id is a no-op under the unique index.
		sourceId: text("source_id").notNull(),
		// Wall-clock time of the assistant message (transcript `timestamp`, UTC).
		timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
		// What the event records, in gen_ai.operation.name terms ("chat" is an
		// inference turn). Free-form text: the semconv values are still in flux.
		operation: text("operation").notNull().default("chat"),
		// Latest model on the message; null when the source line omits it.
		model: text("model"),
		// The raw `message.usage` object, stored verbatim (schema-on-read). Its
		// shape is the agent's native usage (snake_case for Claude Code), distinct
		// from agent_entries.usage which is the normalized AgentUsage rollup.
		usage: text("usage", { mode: "json" })
			.$type<Record<string, unknown>>()
			.notNull(),
		// Client-provided cost for this turn (e.g. the transcript's costUSD);
		// summed into the rollup. The server never computes prices.
		costUsd: real("cost_usd"),
		// Non-usage metadata keyed by OTel attribute names where one exists
		// (vcs.ref.head.name, app.version, ...). Verbatim, bounded at ingest,
		// read defensively via json_extract like the raw usage.
		attributes: text("attributes", { mode: "json" }).$type<Record<
			string,
			unknown
		> | null>(),
		createdAt: createdAtMs(),
	},
	(table) => [
		uniqueIndex("agent_events_source_uq").on(table.agentId, table.sourceId),
		index("agent_events_session_idx").on(table.agentId, table.sessionId),
		index("agent_events_workspace_idx").on(table.workspaceId, table.createdAt),
	],
);
