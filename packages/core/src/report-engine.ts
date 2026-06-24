import { Liquid } from "liquidjs";

import { todayInTimezone } from "./common";
import { formatDuration } from "./duration";
import type { DateRangePreset } from "./report";

export interface ReportContextInput {
	report: { name: string; note: string | null };
	period: { from: string; to: string; preset: DateRangePreset | null };
	timezone: string;
	generatedAt: Date;
	workspaces: Array<{
		id: string;
		slug: string;
		name: string;
		timezone: string;
	}>;
	projects: Array<{
		id: string;
		slug: string;
		name: string;
		workspaceId: string;
	}>;
	users: Array<{ id: string; name: string }>;
	spans: Array<{
		id: string;
		workspaceId: string;
		projectId: string | null;
		userId: string;
		spanDate: string;
		durationMinutes: number;
		description: string;
		note: string | null;
		tags: string[];
	}>;
}

type ContextSpan = {
	id: string;
	workspace_id: string;
	workspace_name: string;
	project_id: string;
	project_name: string;
	user_id: string;
	user_name: string;
	span_date: string;
	duration_minutes: number;
	description: string;
	note: string | null;
	tags: string[];
};

type SpanGroup = {
	key: string;
	name?: string;
	spans: ContextSpan[];
	total_minutes: number;
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

function groupSpans(
	spans: ContextSpan[],
	keyOf: (span: ContextSpan) => string,
	nameOf?: (span: ContextSpan) => string,
): SpanGroup[] {
	const groups = new Map<string, SpanGroup>();
	for (const span of spans) {
		const key = keyOf(span);
		let group = groups.get(key);
		if (!group) {
			group = { key, spans: [], total_minutes: 0 };
			if (nameOf) group.name = nameOf(span);
			groups.set(key, group);
		}
		group.spans.push(span);
		group.total_minutes += span.duration_minutes;
	}
	return [...groups.values()];
}

export function buildReportContext(
	input: ReportContextInput,
): Record<string, unknown> {
	const workspaceNames = new Map(input.workspaces.map((w) => [w.id, w.name]));
	const projectNames = new Map(input.projects.map((p) => [p.id, p.name]));
	const userNames = new Map(input.users.map((u) => [u.id, u.name]));
	const named = (map: Map<string, string>, id: string) =>
		map.get(id) ?? "(unknown)";

	const spans: ContextSpan[] = input.spans.map((span) => ({
		id: span.id,
		workspace_id: span.workspaceId,
		workspace_name: named(workspaceNames, span.workspaceId),
		// Spans whose project was deleted have a null projectId; group them
		// together under a stable empty key with a clear placeholder name.
		project_id: span.projectId ?? "",
		project_name: span.projectId
			? named(projectNames, span.projectId)
			: "(no project)",
		user_id: span.userId,
		user_name: named(userNames, span.userId),
		span_date: span.spanDate,
		duration_minutes: span.durationMinutes,
		description: span.description,
		note: span.note,
		tags: span.tags,
	}));

	const byName = (a: SpanGroup, b: SpanGroup) =>
		(a.name ?? "").localeCompare(b.name ?? "");
	const byDate = groupSpans(spans, (e) => e.span_date).sort((a, b) =>
		a.key.localeCompare(b.key),
	);
	const byProject = groupSpans(
		spans,
		(e) => e.project_id,
		(e) => e.project_name,
	).sort(byName);
	const byUser = groupSpans(
		spans,
		(e) => e.user_id,
		(e) => e.user_name,
	).sort(byName);

	const minutes = spans.reduce((acc, e) => acc + e.duration_minutes, 0);

	return {
		report: { name: input.report.name, note: input.report.note },
		period: input.period,
		timezone: input.timezone,
		generated_at: input.generatedAt.toISOString(),
		// Local date of generation in the report timezone; the UTC date of
		// generated_at can lag a day behind for ahead-of-UTC workspaces.
		generated_date: todayInTimezone(input.timezone, input.generatedAt),
		workspaces: input.workspaces.map((w) => ({
			id: w.id,
			slug: w.slug,
			name: w.name,
			timezone: w.timezone,
		})),
		projects: input.projects.map((p) => ({
			id: p.id,
			slug: p.slug,
			name: p.name,
			workspace_id: p.workspaceId,
		})),
		users: input.users.map((u) => ({ id: u.id, name: u.name })),
		spans,
		groups: { by_date: byDate, by_project: byProject, by_user: byUser },
		totals: {
			minutes,
			hours: Math.round((minutes / 60) * 100) / 100,
			spans: spans.length,
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
