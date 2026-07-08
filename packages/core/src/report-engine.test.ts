import { expect, it } from "vitest";
import type { ReportContextInput } from "./report-engine";
import { buildReportContext, renderReport } from "./report-engine";

// A representative report body (the shipped default template format) used to
// pin the engine's rendered output. The shipped catalog lives in
// @spantail/templates; this fixture keeps the engine test self-contained.
const DEFAULT_BODY = `# {{ report.name }}

**Period:** {{ period.from }}{% if period.to != period.from %} – {{ period.to }}{% endif %} · **Total:** {{ totals.minutes | format_duration }} ({{ totals.entries }} entries)

{% if totals.entries == 0 -%}
_No work entries in this period._

{% else -%}
{% for group in groups.by_project -%}
## {{ group.name }} — {{ group.total_minutes | format_duration }}

{% for entry in group.entries -%}
- {{ entry.description }} ({{ entry.duration_minutes | format_duration }}, {{ entry.user_name }}{% if entry.tags.size > 0 %}, tags: {{ entry.tags | join: ", " }}{% endif %})
{% endfor %}
{% endfor -%}
{% endif -%}
{% if report.note -%}
## Notes

{{ report.note }}

{% endif -%}
---

_Generated {{ generated_date }}_
`;

const fixture: ReportContextInput = {
	report: {
		name: "Team weekly",
		note: "Shipped the report engine.\n\n**Next week:** share links.",
	},
	user: { name: "Alice" },
	period: { from: "2026-05-25", to: "2026-05-31", preset: "last_week" },
	timezone: "Asia/Tokyo",
	generatedAt: new Date("2026-06-01T09:00:00Z"),
	workspaces: [
		{ id: "ws1", slug: "acme", name: "Acme" },
		{ id: "ws2", slug: "labs", name: "Labs" },
	],
	projects: [
		{ id: "p1", slug: "spantail", name: "Spantail", workspaceId: "ws1" },
		{ id: "p2", slug: "website", name: "Website", workspaceId: "ws1" },
		{ id: "p3", slug: "research", name: "Research", workspaceId: "ws2" },
	],
	users: [
		{ id: "u1", name: "Alice" },
		{ id: "u2", name: "Bob" },
	],
	entries: [
		entry("e1", "p1", "u1", "2026-05-25", 90, "Designed the scope schema", [
			"api",
		]),
		entry("e2", "p1", "u2", "2026-05-25", 45, "Reviewed the schema design", [
			"review",
		]),
		entry("e3", "p2", "u1", "2026-05-26", 120, "Rebuilt the landing page", []),
		entry("e4", "p1", "u1", "2026-05-27", 60, "Implemented date presets", [
			"api",
		]),
		entry("e5", "p3", "u2", "2026-05-27", 180, "Benchmarked D1 queries", [
			"perf",
		]),
		entry("e6", "p2", "u2", "2026-05-28", 30, "Fixed the contact form", []),
		entry("e7", "p1", "u2", "2026-05-29", 75, "Wired the run endpoint", [
			"api",
		]),
		entry("e8", "p3", "u1", "2026-05-31", 150, "Wrote the benchmark report", [
			"perf",
			"docs",
		]),
	],
	agents: [
		{ id: "a1", name: "Claude Code", type: "claude_code" },
		{ id: "a2", name: "Cursor", type: "claude_code" },
	],
	agentEntries: [
		agentEntry("ae1", "a1", "p1", "u1", "2026-05-25", 40, {
			totalTokens: 1000,
			inputTokens: 600,
			outputTokens: 300,
		}),
		agentEntry("ae2", "a1", "p1", "u1", "2026-05-26", 20, {
			totalTokens: 500,
			inputTokens: 300,
			outputTokens: 200,
		}),
		// Null usage (a source that can't expose tokens, e.g. Cursor): 0 tokens.
		agentEntry("ae3", "a2", "p3", "u2", "2026-05-27", 60, null),
		// No project (ON DELETE SET NULL), with cost/model on its usage.
		agentEntry("ae4", "a1", null, "u1", "2026-05-28", 15, {
			totalTokens: 200,
			inputTokens: 100,
			outputTokens: 100,
			costUsd: 0.05,
			model: "claude-opus-4-8",
		}),
	],
};

function entry(
	id: string,
	projectId: string,
	userId: string,
	entryDate: string,
	durationMinutes: number,
	description: string,
	tags: string[],
) {
	return {
		id,
		workspaceId: projectId === "p3" ? "ws2" : "ws1",
		projectId,
		userId,
		entryDate,
		durationMinutes,
		description,
		note: null,
		tags,
	};
}

function agentEntry(
	id: string,
	agentId: string,
	projectId: string | null,
	ownerUserId: string,
	entryDate: string,
	durationMinutes: number,
	usage: {
		totalTokens: number;
		inputTokens?: number;
		outputTokens?: number;
		cacheCreationTokens?: number;
		cacheReadTokens?: number;
		costUsd?: number;
		model?: string;
	} | null,
) {
	return {
		id,
		workspaceId: projectId === "p3" ? "ws2" : "ws1",
		projectId,
		ownerUserId,
		agentId,
		entryDate,
		durationMinutes,
		usage,
		description: null,
		startedAt: `${entryDate}T00:00:00.000Z`,
		endedAt: null,
	};
}

it("renders the default template (golden)", async () => {
	const rendered = await renderReport(DEFAULT_BODY, fixture);
	await expect(rendered).toMatchFileSnapshot("./report-golden/default.md");
});

it("omits the notes section when the note is null", async () => {
	const rendered = await renderReport(DEFAULT_BODY, {
		...fixture,
		report: { name: "Daily", note: null },
	});
	expect(rendered).not.toContain("## Notes");
});

it("escapes entry content so a raw-HTML block cannot swallow the report", async () => {
	// A tag with a newline followed by a block-level HTML opener (`<!--`) would,
	// unescaped, start a CommonMark HTML block that runs to end-of-document and
	// collapses every later section into raw text (#173). Output escaping turns
	// `<` into `&lt;`, so the construct never forms.
	const rendered = await renderReport(DEFAULT_BODY, {
		...fixture,
		entries: [
			entry("e1", "p1", "u1", "2026-05-25", 60, "Shipped the billing fix", [
				"qa-broken",
				"x\n<!--internal",
			]),
		],
	});
	expect(rendered).toContain("&lt;!--internal");
	expect(rendered).not.toContain("<!--internal");
	// Sections after the entry stay intact rather than being swallowed.
	expect(rendered).toContain("_Generated 2026-06-01_");
});

it("renders an empty-period placeholder", async () => {
	const rendered = await renderReport(DEFAULT_BODY, {
		...fixture,
		entries: [],
	});
	expect(rendered).toContain("_No work entries in this period._");
});

it("computes totals and group ordering in the context", () => {
	const context = buildReportContext(fixture) as {
		totals: { minutes: number; hours: number; entries: number };
		groups: {
			by_date: Array<{ key: string }>;
			by_project: Array<{ name?: string; total_minutes: number }>;
		};
		entries: Array<{ project_name: string; user_name: string }>;
	};
	// Work totals stay human-only; agent rollups live under `totals.agents`.
	expect(context.totals).toMatchObject({
		minutes: 750,
		hours: 12.5,
		entries: 8,
	});
	expect(context.groups.by_date.map((g) => g.key)).toEqual([
		"2026-05-25",
		"2026-05-26",
		"2026-05-27",
		"2026-05-28",
		"2026-05-29",
		"2026-05-31",
	]);
	expect(context.groups.by_project.map((g) => g.name)).toEqual([
		"Research",
		"Spantail",
		"Website",
	]);
	expect(context.entries[0]?.project_name).toBe("Spantail");
	expect(context.entries[0]?.user_name).toBe("Alice");
});

it("groups entries from a deleted project under a no-project placeholder", () => {
	const context = buildReportContext({
		...fixture,
		entries: [
			entry("e1", "p1", "u1", "2026-05-25", 60, "Kept its project", []),
			// projectId is null when the project was deleted (ON DELETE SET NULL).
			{
				id: "e2",
				workspaceId: "ws1",
				projectId: null,
				userId: "u1",
				entryDate: "2026-05-26",
				durationMinutes: 30,
				description: "Orphaned by a project deletion",
				note: null,
				tags: [],
			},
		],
	}) as {
		groups: { by_project: Array<{ key: string; name?: string }> };
		entries: Array<{ project_id: string; project_name: string }>;
	};
	const orphan = context.entries.find((e) => e.project_id === "");
	expect(orphan?.project_name).toBe("(no project)");
	expect(context.groups.by_project.map((g) => g.name)).toContain(
		"(no project)",
	);
});

it("rejects disabled tags", async () => {
	await expect(renderReport("{% include 'other' %}", fixture)).rejects.toThrow(
		/disabled/,
	);
});

it("rejects unknown filters", async () => {
	await expect(
		renderReport("{{ report.name | dangerous }}", fixture),
	).rejects.toThrow(/dangerous/);
});

it("blocks prototype access and renders unknown variables as empty", async () => {
	expect(await renderReport("[{{ entries[0].constructor }}]", fixture)).toBe(
		"[]",
	);
	expect(await renderReport("[{{ nonexistent.thing }}]", fixture)).toBe("[]");
});

it("exposes user and a period label for name/note templates", async () => {
	const rendered = await renderReport(
		"{{ workspaces[0].name }} {{ user.name }} {{ period.label }}",
		fixture,
	);
	expect(rendered).toBe("Acme Alice 2026-05-25 – 2026-05-31");
});

it("renders name/note templates with a scope-only context (no entries)", async () => {
	// The compose preview renders name/note Liquid before any entries exist.
	const scopeOnly: ReportContextInput = {
		...fixture,
		entries: [],
		agentEntries: [],
	};
	expect(
		await renderReport(
			"{% if workspaces.size > 0 %}{{ workspaces[0].name }} {% endif %}{{ user.name }}",
			scopeOnly,
		),
	).toBe("Acme Alice");
});

it("exposes agent totals, groups, and flattened token buckets", () => {
	const context = buildReportContext(fixture) as {
		totals: {
			agents: {
				sessions: number;
				minutes: number;
				hours: number;
				tokens: number;
				input_tokens: number;
				output_tokens: number;
			};
		};
		agent_entries: Array<{
			id: string;
			agent_name: string;
			total_tokens: number;
			cost_usd: number | null;
			model: string | null;
		}>;
		agent_groups: {
			by_agent: Array<{
				name?: string;
				session_count: number;
				total_minutes: number;
				total_tokens: number;
			}>;
		};
	};
	// input+output (1000+600) is less than total tokens (1700): buckets are
	// optional per agent, so the sums are independent.
	expect(context.totals.agents).toEqual({
		sessions: 4,
		minutes: 135,
		hours: 2.25,
		tokens: 1700,
		input_tokens: 1000,
		output_tokens: 600,
	});
	// A null-usage session contributes 0 tokens and no cost/model.
	const cursor = context.agent_entries.find((e) => e.id === "ae3");
	expect(cursor?.total_tokens).toBe(0);
	expect(cursor?.cost_usd).toBeNull();
	expect(cursor?.model).toBeNull();
	// Cost/model flatten through from usage when present.
	const orphan = context.agent_entries.find((e) => e.id === "ae4");
	expect(orphan?.cost_usd).toBe(0.05);
	expect(orphan?.model).toBe("claude-opus-4-8");
	// by_agent groups sorted by name, with per-group rollups.
	expect(context.agent_groups.by_agent.map((g) => g.name)).toEqual([
		"Claude Code",
		"Cursor",
	]);
	expect(
		context.agent_groups.by_agent.find((g) => g.name === "Claude Code"),
	).toMatchObject({ session_count: 3, total_minutes: 75, total_tokens: 1700 });
});

it("places a no-project agent session under the no-project placeholder", () => {
	const context = buildReportContext(fixture) as {
		agent_entries: Array<{
			id: string;
			project_id: string;
			project_name: string;
		}>;
		agent_groups: { by_project: Array<{ name?: string }> };
	};
	const orphan = context.agent_entries.find((e) => e.id === "ae4");
	expect(orphan?.project_id).toBe("");
	expect(orphan?.project_name).toBe("(no project)");
	expect(context.agent_groups.by_project.map((g) => g.name)).toContain(
		"(no project)",
	);
});

it("renders agent activity in a template", async () => {
	const body =
		"Sessions: {{ totals.agents.sessions }}, Tokens: {{ totals.agents.tokens }}{% for g in agent_groups.by_agent %} | {{ g.name }}: {{ g.total_minutes | format_duration }} ({{ g.total_tokens }} tok){% endfor %}";
	const rendered = await renderReport(body, fixture);
	expect(rendered).toBe(
		"Sessions: 4, Tokens: 1700 | Claude Code: 1h 15m (1700 tok) | Cursor: 1h (0 tok)",
	);
});
