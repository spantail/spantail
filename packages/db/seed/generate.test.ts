import { fileURLToPath, URL } from "node:url";
import { splitFrontMatter } from "@spantail/core";
import { describe, expect, it } from "vitest";

import { generateDataset } from "./generate";
import { loadConfig } from "./schema";
import { datasetToSql } from "./to-sql";

// Workspaces no longer store a timezone (it is a per-user concept now), but the
// seed still uses each workspace's configured timezone to generate realistic
// local work patterns. Tests read those generation timezones from the config.
function workspaceTimezones(
	dataDir: string,
	wsRows: Array<Record<string, unknown>>,
): Map<string, string> {
	const tzBySlug = new Map(
		loadConfig(dataDir).workspaces.map((w) => [w.slug, w.timezone]),
	);
	return new Map(
		wsRows.map((w) => {
			const slug = w.slug as string;
			const tz = tzBySlug.get(slug);
			// A missing timezone would silently bucket workspaces together; fail loud.
			if (!tz) throw new Error(`no seed timezone for workspace "${slug}"`);
			return [w.id as string, tz];
		}),
	);
}

type Row = Record<string, unknown>;

// Tests exercise the generator against the shipped English `demo` dataset.
const DEMO_DIR = fileURLToPath(
	new URL("../../../examples/demo/db/seed/", import.meta.url),
);
const DEMO_LOCALE = "en" as const;

// Mid-June: the activity window covers all of May, so May is the one completed
// month and weekday entries land throughout.
const NOW = new Date("2026-06-18T09:00:00Z");

async function build() {
	const dataset = await generateDataset(NOW, DEMO_DIR, DEMO_LOCALE);
	const rows = (name: string): Row[] =>
		dataset.tables.find((t) => t.table === name)?.rows ?? [];
	return { dataset, rows };
}

describe("generateDataset", () => {
	it("creates the expected world", async () => {
		const { dataset, rows } = await build();
		expect(rows("user")).toHaveLength(6);
		expect(rows("account")).toHaveLength(6);
		expect(rows("workspaces")).toHaveLength(5);
		// 5 internal + Acme 3 + Globex 3 + Meridian 2 + Initech 1.
		expect(rows("workspaceMembers")).toHaveLength(14);
		expect(rows("projects")).toHaveLength(14);
		// One default template, in the dataset's locale (demo → English).
		expect(rows("reportTemplates")).toHaveLength(1);
		expect(rows("instanceSettings")).toHaveLength(1);
		expect(dataset.credentials).toHaveLength(6);
	});

	it("seeds project members who are all workspace members", async () => {
		const { rows } = await build();
		const projectMembers = rows("projectMembers");
		expect(projectMembers.length).toBeGreaterThan(0);
		const projectWorkspace = new Map(
			rows("projects").map((p) => [p.id as string, p.workspaceId as string]),
		);
		const wsMembership = new Set(
			rows("workspaceMembers").map(
				(m) => `${m.workspaceId as string}:${m.userId as string}`,
			),
		);
		for (const pm of projectMembers) {
			const ws = projectWorkspace.get(pm.projectId as string);
			expect(wsMembership.has(`${ws}:${pm.userId as string}`)).toBe(true);
		}
	});

	it("flags exactly one instance admin and one template author", async () => {
		const { rows } = await build();
		const users = rows("user");
		expect(users.filter((u) => u.isAdmin === true)).toHaveLength(1);
		expect(users.filter((u) => u.canManageTemplates === true)).toHaveLength(1);
	});

	it("logs varied hours on weekdays only, in quarter-hour units", async () => {
		const { rows } = await build();
		const entries = rows("workEntries");
		expect(entries.length).toBeGreaterThan(0);

		const perUserDay = new Map<string, number>();
		for (const e of entries) {
			const date = e.entryDate as string;
			const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
			expect(dow).toBeGreaterThanOrEqual(1);
			expect(dow).toBeLessThanOrEqual(5);
			const minutes = e.durationMinutes as number;
			expect(minutes).toBeGreaterThan(0);
			expect(minutes % 15).toBe(0);
			const key = `${e.userId}:${date}`;
			perUserDay.set(key, (perUserDay.get(key) ?? 0) + minutes);
		}
		const totals = [...perUserDay.values()];
		// Days should have texture, not a flat 8h — totals vary across the window.
		expect(new Set(totals).size).toBeGreaterThan(1);
		// ...but stay in a believable band around a typical ~8h day, and average
		// near it, so cadence/jitter can't silently drift totals far off.
		for (const total of totals) {
			expect(total).toBeGreaterThanOrEqual(150); // > ~2.5h
			expect(total).toBeLessThanOrEqual(840); // < ~14h
		}
		const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
		expect(avg).toBeGreaterThan(420); // ~7h
		expect(avg).toBeLessThan(540); // ~9h
	});

	it("computes monthly periods in each workspace timezone", async () => {
		// 2026-07-01T00:00Z: Tokyo is already Jul 1 (June is complete locally),
		// while Los Angeles is still Jun 30 (June is not complete locally).
		const dataset = await generateDataset(
			new Date("2026-07-01T00:00:00Z"),
			DEMO_DIR,
			DEMO_LOCALE,
		);
		const rows = (name: string): Row[] =>
			dataset.tables.find((t) => t.table === name)?.rows ?? [];
		const tzById = workspaceTimezones(DEMO_DIR, rows("workspaces"));
		const juneTimezones = new Set<string | undefined>();
		for (const r of rows("reports")) {
			const filters = r.filters as {
				workspaceIds: string[];
				dateRange: { from: string; to: string };
			};
			// Monthly reports span more than a day and start on the 1st.
			if (
				filters.dateRange.from === "2026-06-01" &&
				filters.dateRange.to !== "2026-06-01"
			) {
				juneTimezones.add(tzById.get(filters.workspaceIds[0] ?? ""));
			}
		}
		expect(juneTimezones.has("Asia/Tokyo")).toBe(true);
		expect(juneTimezones.has("America/Los_Angeles")).toBe(false);
	});

	it("dates entries in the workspace timezone, not the author's home", async () => {
		// 06:00Z: Tokyo is already Fri 2026-06-19; Los Angeles is still Thu 06-18.
		const dataset = await generateDataset(
			new Date("2026-06-19T06:00:00Z"),
			DEMO_DIR,
			DEMO_LOCALE,
		);
		const rows = (name: string): Row[] =>
			dataset.tables.find((t) => t.table === name)?.rows ?? [];
		const tzById = workspaceTimezones(DEMO_DIR, rows("workspaces"));
		const maxByTz = new Map<string, string>();
		for (const e of rows("workEntries")) {
			const tz = tzById.get(e.workspaceId as string) ?? "";
			const date = e.entryDate as string;
			if (!maxByTz.has(tz) || date > (maxByTz.get(tz) ?? "")) {
				maxByTz.set(tz, date);
			}
		}
		expect(maxByTz.get("Asia/Tokyo")).toBe("2026-06-19");
		expect(maxByTz.get("America/Los_Angeles")).toBe("2026-06-18");
	});

	it("seeds the default templates and references them from every report", async () => {
		const { rows } = await build();
		const templateRows = rows("reportTemplates");
		// One default template, in the dataset's locale (demo → English), enabled.
		expect(templateRows.length).toBe(1);
		expect(templateRows.every((t) => t.enabled === true)).toBe(true);
		const templateIds = new Set(templateRows.map((t) => t.id));
		for (const report of rows("reports")) {
			expect(templateIds.has(report.templateId)).toBe(true);
		}
	});

	it("renders daily and monthly reports with a total and body", async () => {
		const { rows } = await build();
		const reports = rows("reports");
		// Each report has a version-1 content row holding its rendered body.
		const contentByReport = new Map(
			rows("reportContent").map((c) => [
				c.reportId as string,
				c.content as string,
			]),
		);
		expect(reports.length).toBeGreaterThan(0);
		for (const r of reports) {
			const content = contentByReport.get(r.id as string) as string;
			expect(content).toContain(r.name as string);
			// Seeded content carries the system YAML front-matter header (as the API
			// composes it), so the reading pane's "Show header" has data to display.
			expect(splitFrontMatter(content).frontMatter).not.toBeNull();
			expect(r.totalMinutes as number).toBeGreaterThan(0);
			expect(r.version).toBe(1);
		}
		// Monthly reports render with the English default template.
		const monthly = reports.find((r) =>
			String(r.name).startsWith("Monthly report"),
		);
		expect(monthly).toBeDefined();
		expect(contentByReport.get(monthly?.id as string)).toContain("Total");
	});

	it("delivers reports to a workspace manager (never the sender)", async () => {
		const { rows } = await build();
		const deliveries = rows("reportDeliveries");
		expect(deliveries.length).toBeGreaterThan(0);
		for (const d of deliveries) {
			expect(d.recipientUserId).not.toBe(d.senderUserId);
			expect(d.renderedMarkdown as string).toBeTruthy();
		}
	});

	it("delivers cross-workspace reports only to members of every workspace", async () => {
		const { rows } = await build();
		const reports = rows("reports");
		const deliveries = rows("reportDeliveries");

		// Membership: workspaceId -> set of member userIds.
		const membersByWs = new Map<string, Set<string>>();
		for (const m of rows("workspaceMembers")) {
			const set = membersByWs.get(m.workspaceId as string) ?? new Set<string>();
			set.add(m.userId as string);
			membersByWs.set(m.workspaceId as string, set);
		}
		const reportById = new Map(reports.map((r) => [r.id as string, r]));

		const crossWorkspace = reports.filter(
			(r) => (r.filters as { workspaceIds: string[] }).workspaceIds.length > 1,
		);
		expect(crossWorkspace.length).toBeGreaterThan(0);

		const crossIds = new Set(crossWorkspace.map((r) => r.id));
		const crossDeliveries = deliveries.filter((d) => crossIds.has(d.reportId));
		// A cross-workspace report that exists purely to be undeliverable would
		// defeat the demo — these are actually sent.
		expect(crossDeliveries.length).toBeGreaterThan(0);

		for (const d of crossDeliveries) {
			const report = reportById.get(d.reportId as string);
			const workspaceIds = (report?.filters as { workspaceIds: string[] })
				.workspaceIds;
			for (const wsId of workspaceIds) {
				expect(membersByWs.get(wsId)?.has(d.recipientUserId as string)).toBe(
					true,
				);
			}
			expect(d.recipientUserId).not.toBe(d.senderUserId);
		}
	});

	it("publishes shares only for client monthly reports, each carrying its frozen body", async () => {
		const { rows } = await build();
		const shares = rows("reportShares");
		// The share's frozen body is the report's current content version.
		const renderedByReport = new Map(
			rows("reportContent").map((c) => [
				c.reportId as string,
				c.content as string,
			]),
		);
		// Every share freezes the parent report's rendered body on its own row.
		for (const s of shares) {
			expect(typeof s.renderedMarkdown).toBe("string");
			expect(s.renderedMarkdown).toBe(
				renderedByReport.get(s.reportId as string),
			);
		}

		// Northwind (internal) and Initech (Frank's solo workspace) are the two
		// non-client workspaces; client workspaces are Acme, Globex, and Meridian.
		const nonClientSlugs = new Set(["northwind", "initech"]);
		const nonClientWsIds = new Set(
			rows("workspaces")
				.filter((w) => nonClientSlugs.has(w.slug as string))
				.map((w) => w.id as string),
		);
		expect(
			nonClientWsIds.size,
			"non-client workspaces (northwind, initech) are missing",
		).toBe(2);
		const sharesByReport = new Map<string, number>();
		for (const s of shares) {
			const id = s.reportId as string;
			sharesByReport.set(id, (sharesByReport.get(id) ?? 0) + 1);
		}

		// Invariant: every monthly report in a client workspace has exactly one
		// share; a non-client monthly report has none. Deterministic NOW, so we can
		// assert exact counts without hard-coding a total.
		let clientMonthlies = 0;
		let nonClientMonthlies = 0;
		for (const r of rows("reports")) {
			const filters = r.filters as {
				workspaceIds: string[];
				dateRange: { from: string; to: string };
			};
			const isMonthly =
				filters.workspaceIds.length === 1 &&
				filters.dateRange.from < filters.dateRange.to;
			if (!isMonthly) continue;
			const shareCount = sharesByReport.get(r.id as string) ?? 0;
			if (nonClientWsIds.has(filters.workspaceIds[0] as string)) {
				nonClientMonthlies++;
				expect(shareCount).toBe(0);
			} else {
				clientMonthlies++;
				expect(shareCount).toBe(1);
			}
		}
		// Both branches are exercised by the demo world.
		expect(clientMonthlies).toBeGreaterThan(0);
		expect(nonClientMonthlies).toBeGreaterThan(0);
		expect(shares).toHaveLength(clientMonthlies);
	});

	it("seeds agents with coherent per-session telemetry", async () => {
		const { rows } = await build();
		const agents = rows("agents");
		const entries = rows("agentEntries");
		const events = rows("agentEvents");
		expect(agents.length).toBeGreaterThan(0);
		expect(rows("agentTokens")).toHaveLength(agents.length);
		expect(entries.length).toBeGreaterThan(0);
		expect(events.length).toBeGreaterThan(entries.length);
		expect(agents.every((a) => a.type === "claude_code")).toBe(true);
		expect(agents.every((a) => a.name === "My Claude Code")).toBe(true);

		// Each agent has a long history (50+ entries) so the activity view is
		// pageable in the demo.
		for (const agent of agents) {
			const owned = entries.filter((e) => e.agentId === agent.id);
			expect(owned.length).toBeGreaterThanOrEqual(50);
		}

		// Each entry's rollup must match its session's events exactly: the
		// materialized totals are derived from the same per-turn rows the ingest
		// route would aggregate (no double counting, duration = max−min).
		const eventsBySession = new Map<string, Row[]>();
		for (const e of events) {
			const key = `${e.agentId}:${e.sessionId}`;
			(eventsBySession.get(key) ?? eventsBySession.set(key, []).get(key))?.push(
				e,
			);
		}
		for (const entry of entries) {
			const group = eventsBySession.get(`${entry.agentId}:${entry.sessionId}`);
			expect(group?.length).toBeGreaterThan(0);
			const summed = (group ?? []).reduce((acc, e) => {
				const u = e.usage as Record<string, number | undefined>;
				return (
					acc +
					(u.input_tokens ?? 0) +
					(u.output_tokens ?? 0) +
					(u.cache_creation_input_tokens ?? 0) +
					(u.cache_read_input_tokens ?? 0)
				);
			}, 0);
			const usage = entry.usage as { totalTokens: number };
			expect(usage.totalTokens).toBe(summed);

			const times = (group ?? []).map((e) => (e.timestamp as Date).getTime());
			const expectedDuration = Math.max(
				0,
				Math.round((Math.max(...times) - Math.min(...times)) / 60_000),
			);
			expect(entry.durationMinutes).toBe(expectedDuration);
		}
	});

	it("seeds the Japanese default template for a -ja dataset", async () => {
		const demoJaDir = fileURLToPath(
			new URL("../../../examples/demo-ja/db/seed/", import.meta.url),
		);
		const dataset = await generateDataset(NOW, demoJaDir, "ja");
		const rows = (name: string): Row[] =>
			dataset.tables.find((t) => t.table === name)?.rows ?? [];
		// One template, and the rendered Japanese monthly report uses it ("合計").
		expect(rows("reportTemplates")).toHaveLength(1);
		const contentByReport = new Map(
			rows("reportContent").map((c) => [
				c.reportId as string,
				c.content as string,
			]),
		);
		const monthly = rows("reports").find((r) =>
			String(r.name).startsWith("月報"),
		);
		expect(monthly).toBeDefined();
		expect(contentByReport.get(monthly?.id as string)).toContain("合計");
	});

	it("serializes to non-empty SQL", async () => {
		const { dataset } = await build();
		const sql = datasetToSql(dataset.tables);
		expect(sql).toContain('INSERT INTO "user"');
		expect(sql).toContain('INSERT INTO "work_entries"');
		expect(sql).toContain('INSERT INTO "report_deliveries"');
		expect(sql).toContain('INSERT INTO "agent_events"');
	});
});
