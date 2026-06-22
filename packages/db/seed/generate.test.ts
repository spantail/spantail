import { describe, expect, it } from "vitest";

import { generateDataset } from "./generate";
import { datasetToSql } from "./to-sql";

type Row = Record<string, unknown>;

// Mid-June: the activity window covers all of May, so May is the one completed
// month and weekday entries land throughout.
const NOW = new Date("2026-06-18T09:00:00Z");

async function build() {
	const dataset = await generateDataset(NOW);
	const rows = (name: string): Row[] =>
		dataset.tables.find((t) => t.table === name)?.rows ?? [];
	return { dataset, rows };
}

describe("generateDataset", () => {
	it("creates the expected world", async () => {
		const { dataset, rows } = await build();
		expect(rows("user")).toHaveLength(5);
		expect(rows("account")).toHaveLength(5);
		expect(rows("workspaces")).toHaveLength(4);
		// 5 internal + Acme 3 + Globex 3 + 桜 2.
		expect(rows("workspaceMembers")).toHaveLength(13);
		expect(rows("projects")).toHaveLength(12);
		expect(rows("reportTemplates")).toHaveLength(4);
		expect(rows("instanceSettings")).toHaveLength(1);
		expect(dataset.credentials).toHaveLength(5);
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
		const dataset = await generateDataset(new Date("2026-07-01T00:00:00Z"));
		const rows = (name: string): Row[] =>
			dataset.tables.find((t) => t.table === name)?.rows ?? [];
		const tzById = new Map(
			rows("workspaces").map((w) => [w.id as string, w.timezone as string]),
		);
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
		const dataset = await generateDataset(new Date("2026-06-19T06:00:00Z"));
		const rows = (name: string): Row[] =>
			dataset.tables.find((t) => t.table === name)?.rows ?? [];
		const tzById = new Map(
			rows("workspaces").map((w) => [w.id as string, w.timezone as string]),
		);
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

	it("uses only enabled custom templates and disables builtins", async () => {
		const { rows } = await build();
		const templateIds = new Set(rows("reportTemplates").map((t) => t.id));
		for (const report of rows("reports")) {
			expect(templateIds.has(report.templateId)).toBe(true);
		}
		const overrides = rows("instanceSettings")[0]
			?.reportTemplateOverrides as Record<string, { enabled: boolean }>;
		expect(overrides["builtin:daily"]?.enabled).toBe(false);
		expect(overrides["builtin:weekly"]?.enabled).toBe(false);
		expect(overrides["builtin:monthly"]?.enabled).toBe(false);
	});

	it("renders daily and monthly reports with a total and body", async () => {
		const { rows } = await build();
		const reports = rows("reports");
		expect(reports.length).toBeGreaterThan(0);
		for (const r of reports) {
			expect(r.renderedMarkdown as string).toContain(r.name as string);
			expect(r.totalMinutes as number).toBeGreaterThan(0);
		}
		// Japanese monthly reports (Sakura) use the translated template.
		const ja = reports.find((r) => String(r.name).startsWith("月報"));
		expect(ja).toBeDefined();
		expect(ja?.renderedMarkdown as string).toContain("プロジェクト別");
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
		const renderedByReport = new Map(
			rows("reports").map((r) => [
				r.id as string,
				r.renderedMarkdown as string,
			]),
		);
		// Every share freezes the parent report's rendered body on its own row.
		for (const s of shares) {
			expect(typeof s.renderedMarkdown).toBe("string");
			expect(s.renderedMarkdown).toBe(
				renderedByReport.get(s.reportId as string),
			);
		}

		// The internal workspace (Northwind) is the only non-client one.
		const internalWs = rows("workspaces").find((w) => w.slug === "northwind");
		expect(
			internalWs,
			"internal workspace (slug 'northwind') is missing",
		).toBeDefined();
		const internalWsId = internalWs?.id as string;
		const sharesByReport = new Map<string, number>();
		for (const s of shares) {
			const id = s.reportId as string;
			sharesByReport.set(id, (sharesByReport.get(id) ?? 0) + 1);
		}

		// Invariant: every monthly report in a client workspace has exactly one
		// share; an internal monthly report has none. Deterministic NOW, so we can
		// assert exact counts without hard-coding a total.
		let clientMonthlies = 0;
		let internalMonthlies = 0;
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
			if (filters.workspaceIds[0] === internalWsId) {
				internalMonthlies++;
				expect(shareCount).toBe(0);
			} else {
				clientMonthlies++;
				expect(shareCount).toBe(1);
			}
		}
		// Both branches are exercised by the demo world.
		expect(clientMonthlies).toBeGreaterThan(0);
		expect(internalMonthlies).toBeGreaterThan(0);
		expect(shares).toHaveLength(clientMonthlies);
	});

	it("serializes to non-empty SQL", async () => {
		const { dataset } = await build();
		const sql = datasetToSql(dataset.tables);
		expect(sql).toContain('INSERT INTO "user"');
		expect(sql).toContain('INSERT INTO "work_entries"');
		expect(sql).toContain('INSERT INTO "report_deliveries"');
	});
});
