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
		expect(rows("workspaceMembers")).toHaveLength(12);
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

	it("logs 8h on weekdays only", async () => {
		const { rows } = await build();
		const entries = rows("workEntries");
		expect(entries.length).toBeGreaterThan(0);

		const perUserDay = new Map<string, number>();
		for (const e of entries) {
			const date = e.entryDate as string;
			const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
			expect(dow).toBeGreaterThanOrEqual(1);
			expect(dow).toBeLessThanOrEqual(5);
			expect(e.durationMinutes as number).toBeGreaterThan(0);
			const key = `${e.userId}:${date}`;
			perUserDay.set(
				key,
				(perUserDay.get(key) ?? 0) + (e.durationMinutes as number),
			);
		}
		for (const total of perUserDay.values()) expect(total).toBe(480);
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

	it("publishes shares only for client monthly reports, each backed by R2", async () => {
		const { dataset, rows } = await build();
		const shares = rows("reportShares");
		// 3 client workspaces × 3 members = 9, for the single completed month.
		expect(shares).toHaveLength(9);
		expect(dataset.r2).toHaveLength(9);
		const r2Keys = new Set(dataset.r2.map((o) => o.key));
		for (const s of shares) {
			expect(s.r2Key as string).toBe(`shares/${s.token}`);
			expect(r2Keys.has(s.r2Key as string)).toBe(true);
		}
	});

	it("serializes to non-empty SQL", async () => {
		const { dataset } = await build();
		const sql = datasetToSql(dataset.tables);
		expect(sql).toContain('INSERT INTO "user"');
		expect(sql).toContain('INSERT INTO "work_entries"');
		expect(sql).toContain('INSERT INTO "report_deliveries"');
	});
});
