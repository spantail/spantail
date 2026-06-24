import { expect, it } from "vitest";
import type { ReportContextInput } from "./report-engine";
import { buildReportContext, renderReport } from "./report-engine";
import { builtinReportTemplates, getBuiltinTemplate } from "./report-templates";

const fixture: ReportContextInput = {
	report: {
		name: "Team weekly",
		note: "Shipped the report engine.\n\n**Next week:** share links.",
	},
	period: { from: "2026-05-25", to: "2026-05-31", preset: "last_week" },
	timezone: "Asia/Tokyo",
	generatedAt: new Date("2026-06-01T09:00:00Z"),
	workspaces: [
		{ id: "ws1", slug: "acme", name: "Acme", timezone: "Asia/Tokyo" },
		{ id: "ws2", slug: "labs", name: "Labs", timezone: "UTC" },
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
	spans: [
		span("e1", "p1", "u1", "2026-05-25", 90, "Designed the scope schema", [
			"api",
		]),
		span("e2", "p1", "u2", "2026-05-25", 45, "Reviewed the schema design", [
			"review",
		]),
		span("e3", "p2", "u1", "2026-05-26", 120, "Rebuilt the landing page", []),
		span("e4", "p1", "u1", "2026-05-27", 60, "Implemented date presets", [
			"api",
		]),
		span("e5", "p3", "u2", "2026-05-27", 180, "Benchmarked D1 queries", [
			"perf",
		]),
		span("e6", "p2", "u2", "2026-05-28", 30, "Fixed the contact form", []),
		span("e7", "p1", "u2", "2026-05-29", 75, "Wired the run endpoint", ["api"]),
		span("e8", "p3", "u1", "2026-05-31", 150, "Wrote the benchmark report", [
			"perf",
			"docs",
		]),
	],
};

function span(
	id: string,
	projectId: string,
	userId: string,
	spanDate: string,
	durationMinutes: number,
	description: string,
	tags: string[],
) {
	return {
		id,
		workspaceId: projectId === "p3" ? "ws2" : "ws1",
		projectId,
		userId,
		spanDate,
		durationMinutes,
		description,
		note: null,
		tags,
	};
}

it.each([
	"daily",
	"weekly",
	"monthly",
])("renders the builtin %s template (golden)", async (key) => {
	const template = getBuiltinTemplate(`builtin:${key}`);
	if (!template) throw new Error(`missing builtin:${key}`);
	const rendered = await renderReport(template.body, fixture);
	await expect(rendered).toMatchFileSnapshot(`./report-golden/${key}.md`);
});

it("omits the notes section when the note is null", async () => {
	const template = getBuiltinTemplate("builtin:daily");
	if (!template) throw new Error("missing builtin:daily");
	const rendered = await renderReport(template.body, {
		...fixture,
		report: { name: "Daily", note: null },
	});
	expect(rendered).not.toContain("## Notes");
});

it("renders an empty-period placeholder", async () => {
	const template = getBuiltinTemplate("builtin:monthly");
	if (!template) throw new Error("missing builtin:monthly");
	const rendered = await renderReport(template.body, {
		...fixture,
		spans: [],
	});
	expect(rendered).toContain("_No work spans in this period._");
	expect(rendered).not.toContain("| Project |");
});

it("computes totals and group ordering in the context", () => {
	const context = buildReportContext(fixture) as {
		totals: { minutes: number; hours: number; spans: number };
		groups: {
			by_date: Array<{ key: string }>;
			by_project: Array<{ name?: string; total_minutes: number }>;
		};
		spans: Array<{ project_name: string; user_name: string }>;
	};
	expect(context.totals).toEqual({ minutes: 750, hours: 12.5, spans: 8 });
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
	expect(context.spans[0]?.project_name).toBe("Spantail");
	expect(context.spans[0]?.user_name).toBe("Alice");
});

it("groups spans from a deleted project under a no-project placeholder", () => {
	const context = buildReportContext({
		...fixture,
		spans: [
			span("e1", "p1", "u1", "2026-05-25", 60, "Kept its project", []),
			// projectId is null when the project was deleted (ON DELETE SET NULL).
			{
				id: "e2",
				workspaceId: "ws1",
				projectId: null,
				userId: "u1",
				spanDate: "2026-05-26",
				durationMinutes: 30,
				description: "Orphaned by a project deletion",
				note: null,
				tags: [],
			},
		],
	}) as {
		groups: { by_project: Array<{ key: string; name?: string }> };
		spans: Array<{ project_id: string; project_name: string }>;
	};
	const orphan = context.spans.find((e) => e.project_id === "");
	expect(orphan?.project_name).toBe("(no project)");
	expect(context.groups.by_project.map((g) => g.name)).toContain(
		"(no project)",
	);
});

it("exposes all three builtins", () => {
	expect(builtinReportTemplates.map((t) => t.id)).toEqual([
		"builtin:daily",
		"builtin:weekly",
		"builtin:monthly",
	]);
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
	expect(await renderReport("[{{ spans[0].constructor }}]", fixture)).toBe(
		"[]",
	);
	expect(await renderReport("[{{ nonexistent.thing }}]", fixture)).toBe("[]");
});
