import { Liquid } from "liquidjs";

import type { AgentUsage } from "./agent";
import { todayInTimezone } from "./common";
import { formatDuration } from "./duration";
import type { DateRangePreset } from "./report";
import { formatPeriodLabel } from "./report-period";

export interface ReportContextInput {
	report: { name: string; note: string | null };
	// The running user (report author). Available to name/note Liquid as `user`.
	user: { name: string };
	period: { from: string; to: string; preset: DateRangePreset | null };
	// The timezone the report is rendered in: the running user's timezone. Used
	// for the generation date and as template context (entries are pre-bucketed
	// by their stored local date, so grouping itself needs no timezone).
	timezone: string;
	generatedAt: Date;
	workspaces: Array<{
		id: string;
		slug: string;
		name: string;
	}>;
	projects: Array<{
		id: string;
		slug: string;
		name: string;
		workspaceId: string;
	}>;
	users: Array<{ id: string; name: string }>;
	entries: Array<{
		id: string;
		workspaceId: string;
		projectId: string | null;
		userId: string;
		entryDate: string;
		durationMinutes: number;
		description: string;
		note: string | null;
		tags: string[];
	}>;
	// Registered agents whose sessions appear in `agentEntries`, for name lookup.
	agents: Array<{ id: string; name: string; type: string }>;
	// AI-agent sessions in scope. `entryDate` is the local date of `startedAt` in
	// the report timezone, derived by the caller (agent entries store no date).
	agentEntries: Array<{
		id: string;
		workspaceId: string;
		projectId: string | null;
		ownerUserId: string;
		agentId: string;
		entryDate: string;
		durationMinutes: number;
		usage: AgentUsage | null;
		description: string | null;
		startedAt: string | null;
		endedAt: string | null;
	}>;
}

type ContextEntry = {
	id: string;
	workspace_id: string;
	workspace_name: string;
	project_id: string;
	project_name: string;
	user_id: string;
	user_name: string;
	entry_date: string;
	duration_minutes: number;
	description: string;
	note: string | null;
	tags: string[];
};

type EntryGroup = {
	key: string;
	name?: string;
	entries: ContextEntry[];
	total_minutes: number;
};

type ContextAgentEntry = {
	id: string;
	workspace_id: string;
	workspace_name: string;
	project_id: string;
	project_name: string;
	user_id: string;
	user_name: string;
	agent_id: string;
	agent_name: string;
	entry_date: string;
	duration_minutes: number;
	// Token buckets flattened from `usage`; 0 when the source exposes no usage.
	// `input_tokens + output_tokens` can be less than `total_tokens` (buckets are
	// optional per agent), so never derive one from the others.
	total_tokens: number;
	input_tokens: number;
	output_tokens: number;
	cache_creation_tokens: number;
	cache_read_tokens: number;
	// Null when the source provides no cost / model.
	cost_usd: number | null;
	model: string | null;
	description: string | null;
	started_at: string | null;
	ended_at: string | null;
};

type AgentEntryGroup = {
	key: string;
	name?: string;
	entries: ContextAgentEntry[];
	total_minutes: number;
	total_tokens: number;
	session_count: number;
};

const DISABLED_TAGS = ["include", "render", "layout", "block"];

function createEngine(): Liquid {
	const engine = new Liquid({
		// Templates are untrusted user input.
		ownPropertyOnly: true,
		strictFilters: true,
		strictVariables: false,
		parseLimit: 1e5,
		renderLimit: 1000,
		memoryLimit: 1e7,
		// HTML-escape every interpolated value. Entry/tag/note text is untrusted
		// (see docs/security.md §1); without this a value like `x\n<!--` opens a
		// block-level HTML construct that swallows the rest of the rendered report
		// (#173). Escaping only touches `< > & " '`, so most authored Markdown
		// (bold, headings, lists, `[text](url)` links) in template output still
		// renders; angle-bracket autolinks (`<https://…>`) and inline HTML do not,
		// which is acceptable — raw HTML is dropped by the renderers regardless.
		outputEscape: "escape",
	});
	for (const tag of DISABLED_TAGS) {
		engine.registerTag(tag, {
			parse() {
				throw new Error(`tag "${tag}" is disabled`);
			},
			render() {},
		});
	}
	engine.registerFilter("format_duration", (value: unknown) =>
		formatDuration(Number(value) || 0),
	);
	// Local dates pass through; ISO timestamps reduce to their date part.
	engine.registerFilter("format_date", (value: unknown) =>
		String(value ?? "").slice(0, 10),
	);
	engine.registerFilter("sum", (items: unknown, prop?: string) => {
		if (!Array.isArray(items)) return 0;
		return items.reduce((acc: number, item) => {
			const raw = prop ? (item as Record<string, unknown>)?.[prop] : item;
			return acc + (Number(raw) || 0);
		}, 0);
	});
	engine.registerFilter("group_by", (items: unknown, prop: string) => {
		if (!Array.isArray(items)) return [];
		const groups = new Map<string, { key: string; items: unknown[] }>();
		for (const item of items) {
			const key = String((item as Record<string, unknown>)?.[prop] ?? "");
			const group = groups.get(key) ?? { key, items: [] };
			group.items.push(item);
			groups.set(key, group);
		}
		return [...groups.values()];
	});
	return engine;
}

// Created lazily: a module-level instance would be an import side effect
// that drags liquidjs into bundles that never render reports (the SPA).
let engine: Liquid | undefined;

function groupEntries(
	entries: ContextEntry[],
	keyOf: (entry: ContextEntry) => string,
	nameOf?: (entry: ContextEntry) => string,
): EntryGroup[] {
	const groups = new Map<string, EntryGroup>();
	for (const entry of entries) {
		const key = keyOf(entry);
		let group = groups.get(key);
		if (!group) {
			group = { key, entries: [], total_minutes: 0 };
			if (nameOf) group.name = nameOf(entry);
			groups.set(key, group);
		}
		group.entries.push(entry);
		group.total_minutes += entry.duration_minutes;
	}
	return [...groups.values()];
}

function groupAgentEntries(
	entries: ContextAgentEntry[],
	keyOf: (entry: ContextAgentEntry) => string,
	nameOf?: (entry: ContextAgentEntry) => string,
): AgentEntryGroup[] {
	const groups = new Map<string, AgentEntryGroup>();
	for (const entry of entries) {
		const key = keyOf(entry);
		let group = groups.get(key);
		if (!group) {
			group = {
				key,
				entries: [],
				total_minutes: 0,
				total_tokens: 0,
				session_count: 0,
			};
			if (nameOf) group.name = nameOf(entry);
			groups.set(key, group);
		}
		group.entries.push(entry);
		group.total_minutes += entry.duration_minutes;
		group.total_tokens += entry.total_tokens;
		group.session_count += 1;
	}
	return [...groups.values()];
}

export function buildReportContext(
	input: ReportContextInput,
): Record<string, unknown> {
	const workspaceNames = new Map(input.workspaces.map((w) => [w.id, w.name]));
	const projectNames = new Map(input.projects.map((p) => [p.id, p.name]));
	const userNames = new Map(input.users.map((u) => [u.id, u.name]));
	const agentNames = new Map(input.agents.map((a) => [a.id, a.name]));
	const named = (map: Map<string, string>, id: string) =>
		map.get(id) ?? "(unknown)";

	const entries: ContextEntry[] = input.entries.map((entry) => ({
		id: entry.id,
		workspace_id: entry.workspaceId,
		workspace_name: named(workspaceNames, entry.workspaceId),
		// Entries whose project was deleted have a null projectId; group them
		// together under a stable empty key with a clear placeholder name.
		project_id: entry.projectId ?? "",
		project_name: entry.projectId
			? named(projectNames, entry.projectId)
			: "(no project)",
		user_id: entry.userId,
		user_name: named(userNames, entry.userId),
		entry_date: entry.entryDate,
		duration_minutes: entry.durationMinutes,
		description: entry.description,
		note: entry.note,
		tags: entry.tags,
	}));

	const byName = (a: EntryGroup, b: EntryGroup) =>
		(a.name ?? "").localeCompare(b.name ?? "");
	const byDate = groupEntries(entries, (e) => e.entry_date).sort((a, b) =>
		a.key.localeCompare(b.key),
	);
	const byProject = groupEntries(
		entries,
		(e) => e.project_id,
		(e) => e.project_name,
	).sort(byName);
	const byUser = groupEntries(
		entries,
		(e) => e.user_id,
		(e) => e.user_name,
	).sort(byName);

	const minutes = entries.reduce((acc, e) => acc + e.duration_minutes, 0);

	const agentEntries: ContextAgentEntry[] = input.agentEntries.map((entry) => ({
		id: entry.id,
		workspace_id: entry.workspaceId,
		workspace_name: named(workspaceNames, entry.workspaceId),
		project_id: entry.projectId ?? "",
		project_name: entry.projectId
			? named(projectNames, entry.projectId)
			: "(no project)",
		user_id: entry.ownerUserId,
		user_name: named(userNames, entry.ownerUserId),
		agent_id: entry.agentId,
		agent_name: named(agentNames, entry.agentId),
		entry_date: entry.entryDate,
		duration_minutes: entry.durationMinutes,
		total_tokens: entry.usage?.totalTokens ?? 0,
		input_tokens: entry.usage?.inputTokens ?? 0,
		output_tokens: entry.usage?.outputTokens ?? 0,
		cache_creation_tokens: entry.usage?.cacheCreationTokens ?? 0,
		cache_read_tokens: entry.usage?.cacheReadTokens ?? 0,
		cost_usd: entry.usage?.costUsd ?? null,
		model: entry.usage?.model ?? null,
		description: entry.description,
		started_at: entry.startedAt,
		ended_at: entry.endedAt,
	}));

	const byAgentName = (a: AgentEntryGroup, b: AgentEntryGroup) =>
		(a.name ?? "").localeCompare(b.name ?? "");
	const agentByDate = groupAgentEntries(agentEntries, (e) => e.entry_date).sort(
		(a, b) => a.key.localeCompare(b.key),
	);
	const agentByProject = groupAgentEntries(
		agentEntries,
		(e) => e.project_id,
		(e) => e.project_name,
	).sort(byAgentName);
	const agentByUser = groupAgentEntries(
		agentEntries,
		(e) => e.user_id,
		(e) => e.user_name,
	).sort(byAgentName);
	const agentByAgent = groupAgentEntries(
		agentEntries,
		(e) => e.agent_id,
		(e) => e.agent_name,
	).sort(byAgentName);

	const agentMinutes = agentEntries.reduce(
		(acc, e) => acc + e.duration_minutes,
		0,
	);
	const agentTokens = agentEntries.reduce((acc, e) => acc + e.total_tokens, 0);
	const agentInputTokens = agentEntries.reduce(
		(acc, e) => acc + e.input_tokens,
		0,
	);
	const agentOutputTokens = agentEntries.reduce(
		(acc, e) => acc + e.output_tokens,
		0,
	);

	return {
		report: { name: input.report.name, note: input.report.note },
		user: { name: input.user.name },
		// `label` is the compact period label (e.g. `2026-06`) used by the default
		// template's name Liquid; from/to/preset pass through unchanged.
		period: {
			...input.period,
			label: formatPeriodLabel({
				from: input.period.from,
				to: input.period.to,
			}),
		},
		timezone: input.timezone,
		generated_at: input.generatedAt.toISOString(),
		// Local date of generation in the report timezone; the UTC date of
		// generated_at can lag a day behind for ahead-of-UTC workspaces.
		generated_date: todayInTimezone(input.timezone, input.generatedAt),
		workspaces: input.workspaces.map((w) => ({
			id: w.id,
			slug: w.slug,
			name: w.name,
		})),
		projects: input.projects.map((p) => ({
			id: p.id,
			slug: p.slug,
			name: p.name,
			workspace_id: p.workspaceId,
		})),
		users: input.users.map((u) => ({ id: u.id, name: u.name })),
		agents: input.agents.map((a) => ({ id: a.id, name: a.name, type: a.type })),
		entries,
		agent_entries: agentEntries,
		groups: { by_date: byDate, by_project: byProject, by_user: byUser },
		agent_groups: {
			by_date: agentByDate,
			by_project: agentByProject,
			by_user: agentByUser,
			by_agent: agentByAgent,
		},
		totals: {
			minutes,
			hours: Math.round((minutes / 60) * 100) / 100,
			entries: entries.length,
			// Agent activity is additive: work totals above stay human-only, and
			// `totals.agents` gathers the agent-session rollup in one place.
			agents: {
				sessions: agentEntries.length,
				minutes: agentMinutes,
				hours: Math.round((agentMinutes / 60) * 100) / 100,
				tokens: agentTokens,
				input_tokens: agentInputTokens,
				output_tokens: agentOutputTokens,
			},
		},
	};
}

/** Renders an untrusted Liquid template to Markdown. Throws on template errors. */
export async function renderReport(
	templateBody: string,
	input: ReportContextInput,
): Promise<string> {
	engine ??= createEngine();
	return engine.parseAndRender(templateBody, buildReportContext(input));
}
