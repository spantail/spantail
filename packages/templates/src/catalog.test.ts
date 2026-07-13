import type { DateRangePreset, ReportContextInput } from "@spantail/core";
import { renderReport } from "@spantail/core";
import { expect, it } from "vitest";
import { defaultTemplates } from "./node";

// One period per catalog type, matching each template's default range, so every
// golden reads like real use: a single day (Daily), a Mon–Sun week (Weekly), a
// full month (Monthly).
const PERIODS: Record<
	string,
	{ from: string; to: string; preset: DateRangePreset }
> = {
	daily: { from: "2026-06-15", to: "2026-06-15", preset: "today" },
	weekly: { from: "2026-06-15", to: "2026-06-21", preset: "this_week" },
	monthly: { from: "2026-06-01", to: "2026-06-30", preset: "this_month" },
};

// Shared fixture across all six goldens: two workspaces, three projects, entries
// spanning June (one carries a note so the Daily note sub-bullet is exercised),
// plus agent sessions so the agent-activity section renders.
function fixtureFor(key: string, locale: string): ReportContextInput {
	const period = PERIODS[key];
	if (!period) throw new Error(`no period fixture for "${key}"`);
	return {
		report: {
			name: locale === "ja" ? "サンプルレポート" : "Sample report",
			note:
				locale === "ja"
					? "スプリントの成果を共有します。"
					: "Sharing progress from this sprint.",
		},
		user: { name: "Alice" },
		period,
		timezone: "Asia/Tokyo",
		locale,
		generatedAt: new Date("2026-07-01T09:00:00Z"),
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
			entry(
				"e1",
				"p1",
				"u1",
				"2026-06-15",
				90,
				"Designed the scope schema",
				"Follow up on the edge cases.",
			),
			entry(
				"e2",
				"p2",
				"u2",
				"2026-06-16",
				120,
				"Rebuilt the landing page",
				null,
			),
			entry(
				"e3",
				"p3",
				"u1",
				"2026-06-18",
				180,
				"Benchmarked D1 queries",
				null,
			),
			entry("e4", "p1", "u2", "2026-06-20", 60, "Wired the run endpoint", null),
		],
		agents: [{ id: "a1", name: "Claude Code", type: "claude_code" }],
		agentEntries: [
			agentEntry("ae1", "a1", "p1", "u1", "2026-06-15", 40, 1000),
			agentEntry("ae2", "a1", "p3", "u2", "2026-06-18", 25, 500),
		],
	};
}

function entry(
	id: string,
	projectId: string,
	userId: string,
	entryDate: string,
	durationMinutes: number,
	description: string,
	note: string | null,
) {
	return {
		id,
		workspaceId: projectId === "p3" ? "ws2" : "ws1",
		projectId,
		userId,
		entryDate,
		durationMinutes,
		description,
		note,
		tags: [],
	};
}

function agentEntry(
	id: string,
	agentId: string,
	projectId: string,
	ownerUserId: string,
	entryDate: string,
	durationMinutes: number,
	totalTokens: number,
) {
	return {
		id,
		workspaceId: projectId === "p3" ? "ws2" : "ws1",
		projectId,
		ownerUserId,
		agentId,
		entryDate,
		durationMinutes,
		usage: {
			totalTokens,
			inputTokens: totalTokens * 0.6,
			outputTokens: totalTokens * 0.3,
		},
		description: null,
		startedAt: `${entryDate}T00:00:00.000Z`,
		endedAt: null,
	};
}

for (const template of defaultTemplates) {
	it(`renders ${template.key}.${template.locale} (golden)`, async () => {
		const rendered = await renderReport(
			template.body,
			fixtureFor(template.key, template.locale),
		);
		await expect(rendered).toMatchFileSnapshot(
			`./catalog-golden/${template.key}.${template.locale}.md`,
		);
	});
}
